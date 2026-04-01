import AppError from '../../core/AppError.js';
import { PROJECT_STATUS, MILESTONE_STATUS } from './project.constant.js';
import fs from 'fs';
import fsPromises from 'fs/promises';

class ProjectService {
    constructor({
        projectRepository,
        mediaRepository,
        cloudinaryProvider,
        jobQueue,
        transactionManager,
        redis
    }) {
        this.projectRepository = projectRepository;
        this.mediaRepository = mediaRepository;
        this.cloudinaryProvider = cloudinaryProvider;
        this.jobQueue = jobQueue;
        this.transactionManager = transactionManager;
        this.redis = redis;
    }


    async _processMediaPayload(mediaArray, organizerId, context) {
        const validMediaIds = new Set();
        const newMediaToInsert = [];

        const idsToCheck = [];
        const newItemsToCheck = [];

        for (const item of mediaArray) {
            if (item._id) idsToCheck.push(item._id);
            else if (item.publicId && item.url) newItemsToCheck.push(item);
        }

        if (idsToCheck.length > 0) {
            const ownedMedia = await this.mediaRepository.findManyByIdsAndOwner(idsToCheck, organizerId);
            ownedMedia.forEach(m => validMediaIds.add(m._id.toString()));
        }

        if (newItemsToCheck.length > 0) {
            const publicIds = newItemsToCheck.map(m => m.publicId);
            const existingMedias = await this.mediaRepository.findManyByPublicIds(publicIds);
            const existingPublicIdMap = new Map(existingMedias.map(m => [m.publicId, m]));

            for (const item of newItemsToCheck) {
                const existing = existingPublicIdMap.get(item.publicId);

                if (existing) {
                    if (existing.uploadedBy.toString() === organizerId.toString()) {
                        validMediaIds.add(existing._id.toString());
                    }
                } else {
                    newMediaToInsert.push({
                        originalName: item.originalName || 'unknown_file',
                        url: item.url,
                        publicId: item.publicId,
                        mimetype: item.mimetype || (item.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
                        size: item.size || 0,
                        width: item.width || 0,
                        height: item.height || 0,
                        uploadedBy: organizerId,
                        context: context
                    });
                }
            }
        }

        return {
            validMediaIds: Array.from(validMediaIds),
            newMediaToInsert
        };
    }

    // _calculateVolunteerStats(projectData) {
    //     const stats = projectData.stats || {};
    //     let targetVolunteers = 0;
    //     let isVolunteerFull = false;
    //     let volunteerRoles = projectData.volunteerRoles || [];

    //     if (projectData.needsVolunteers && volunteerRoles.length > 0) {
    //         targetVolunteers = volunteerRoles.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
    //         isVolunteerFull = (stats.currentVolunteers || 0) >= targetVolunteers;
    //     } else {
    //         volunteerRoles = [];
    //         projectData.needsVolunteers = false;
    //     }

    //     return { targetVolunteers, isVolunteerFull, volunteerRoles };
    // }

    // async createDraftProject(organizerId, projectData) {
    //         let coverMediaData = null;
    //         const documentMediaIds = [];

    //         try {
    //             const coverMediaList = Array.isArray(projectData.coverMedia) ? projectData.coverMedia : [];
    //             const documentsList = Array.isArray(projectData.documents) ? projectData.documents : [];

    //             const volunteerLogic = this._calculateVolunteerStats(projectData);

    //             const result = await this.transactionManager.runInTransaction(async (session) => {
    //                 const mediaDocsToInsert = [];

    //                 if (coverMediaList.length > 0) {
    //                     const cover = coverMediaList[0];
    //                     mediaDocsToInsert.push({
    //                         originalName: cover.originalName || 'cover_image',
    //                         url: cover.url,
    //                         publicId: cover.publicId,
    //                         mimetype: cover.mimetype || 'image/jpeg',
    //                         size: cover.size || 0,
    //                         width: cover.width || 0,
    //                         height: cover.height || 0,
    //                         uploadedBy: organizerId,
    //                         context: 'project_cover'
    //                     });
    //                 }

    //                 documentsList.forEach(doc => {
    //                     mediaDocsToInsert.push({
    //                         originalName: doc.originalName || 'document',
    //                         url: doc.url,
    //                         publicId: doc.publicId,
    //                         mimetype: doc.mimetype || 'application/pdf',
    //                         size: doc.size || 0,
    //                         width: doc.width || 0,
    //                         height: doc.height || 0,
    //                         uploadedBy: organizerId,
    //                         context: 'project_document'
    //                     });
    //                 });

    //                 if (mediaDocsToInsert.length > 0) {
    //                     const insertedMedia = await this.mediaRepository.createMany(mediaDocsToInsert, session);
    //                     insertedMedia.forEach((media) => {
    //                         if (media.context === 'project_cover') {
    //                             coverMediaData = { url: media.url, publicId: media.publicId, mediaType: media.mimetype.startsWith('video') ? 'video' : 'image' };
    //                         } else {
    //                             documentMediaIds.push(media._id);
    //                         }
    //                     });
    //                 }

    //                 const newProjectData = {
    //                     ...projectData,
    //                     ...volunteerLogic,
    //                     stats: { ...projectData.stats, targetVolunteers: volunteerLogic.targetVolunteers },
    //                     organizerId,
    //                     coverMedia: coverMediaData || undefined,
    //                     documents: documentMediaIds,
    //                     status: PROJECT_STATUS.DRAFT,
    //                     currentAmount: 0
    //                 };

    //                 return await this.projectRepository.create(newProjectData, session);
    //             });

    //             return result;

    //         } catch (error) {
    //             throw new AppError(`Tạo dự án thất bại: ${error.message}`, 400);
    //         }
    //     }

    async submitForApproval(projectId, organizerId) {
        const project = await this.projectRepository.findById(projectId);
        if (!project) throw new AppError('Không tìm thấy dự án', 404);
        if (project.organizerId.toString() !== organizerId.toString()) {
            throw new AppError('Bạn không có quyền thực hiện hành động này trên dự án của người khác', 403);
        }

        if (!project.startDate || !project.endDate) throw new AppError('Bắt buộc phải có Ngày bắt đầu và Ngày kết thúc.', 400);
        if (!project.documents || project.documents.length === 0) throw new AppError('Bắt buộc phải có tài liệu chứng minh.', 400);
        if (project.targetAmount > 0) {
            if (!project.milestones || project.milestones.length === 0) throw new AppError('Dự án có gọi vốn bắt buộc phải có mốc giải ngân.', 400);
            const sumMilestones = project.milestones.reduce((acc, curr) => acc + curr.targetAmount, 0);
            if (sumMilestones !== project.targetAmount) throw new AppError('Tổng tiền các mốc không khớp ngân sách.', 400);
        }
        if (project.needsVolunteers && (!project.volunteerRoles || project.volunteerRoles.length === 0)) {
            throw new AppError('Dự án thiếu cấu hình vai trò tình nguyện.', 400);
        }

        const updatedProject = await this.projectRepository.transitionStatus(
            projectId,
            PROJECT_STATUS.DRAFT,
            PROJECT_STATUS.PENDING_APPROVAL
        );

        if (!updatedProject) {
            throw new AppError(`Dự án đã được gửi duyệt hoặc không còn ở trạng thái DRAFT. Vui lòng reload trang.`, 409);
        }

        this.jobQueue.addJob('project-ai-scan', 'scan-risk', {
            projectId: updatedProject._id,
            title: updatedProject.title,
            description: updatedProject.description
        }).catch(err => console.error(`[Queue Error] Project ${projectId}:`, err));

        return updatedProject;
    }

    async getFeaturedProjects() {
        return await this.projectRepository.findFeaturedProjects(1);
    }

    async getVolunteerProjects() {
        return await this.projectRepository.findVolunteerProjects(4);
    }

    async getExploreProjects(queryParams) {
        const { page = 1, limit = 9, category, location } = queryParams;
        const skip = (Math.max(1, page) - 1) * Math.max(1, limit);

        if (skip > 5000) {
            throw new AppError('Truy vấn quá sâu. Vui lòng sử dụng bộ lọc hoặc tìm kiếm để có kết quả chính xác hơn.', 400);
        }

        const filter = {};
        let textSearch = null;

        if (category) filter.category = category;

        if (location) {
            textSearch = location;
        }
        const result = await this.projectRepository.findAllProjects({ filter, skip, limit, textSearch });
        const totalPages = Math.ceil(result.total / limit);

        return {
            projects: result.projects,
            pagination: {
                totalItems: result.total,
                currentPage: Number(page),
                totalPages,
                hasNextPage: page < totalPages
            }
        };
    }

    async getProjectDetail(projectId) {
        const project = await this.projectRepository.findByIdWithDetails(projectId);
        if (!project) throw new AppError('Không tìm thấy dự án hoặc dự án đã bị xóa', 404);

        const redisKey = `project:${projectId}:views`;
        this.redis.incr(redisKey).catch(err => console.error(`[Redis Error]:`, err.message));

        return project;
    }

    async getWorkspaceStats(organizerId) {
        const stats = await this.projectRepository.getOrganizerStats(organizerId);
        return {
            totalFundsRaised: stats.totalFundsRaised,
            activeProjects: stats.activeProjects,
            pendingApprovalProjects: stats.pendingProjects,
            pendingVolunteers: 0
        };
    }

    async getWorkspaceProjects(organizerId, queryParams) {
        const { page = 1, limit = 10, status = 'ALL' } = queryParams;
        const skip = (Math.max(1, page) - 1) * Math.max(1, limit);

        const result = await this.projectRepository.findOrganizerProjects({
            organizerId, status, skip, limit
        });

        const formattedProjects = result.projects.map(project => {
            let currentMilestone = null;
            let milestoneIndex = 0;

            if (project.milestones && project.milestones.length > 0) {
                const activeIndex = project.milestones.findIndex(m =>
                    m.status === MILESTONE_STATUS.PROCESSING || m.status === MILESTONE_STATUS.PENDING
                );

                if (activeIndex !== -1) {
                    currentMilestone = project.milestones[activeIndex];
                    milestoneIndex = activeIndex + 1;
                } else {
                    currentMilestone = project.milestones[project.milestones.length - 1];
                    milestoneIndex = project.milestones.length;
                }
            }
            delete project.milestones;

            return {
                ...project,
                currentMilestone: currentMilestone ? {
                    title: currentMilestone.title,
                    targetAmount: currentMilestone.targetAmount,
                    status: currentMilestone.status,
                    index: milestoneIndex
                } : null
            };
        });

        const totalPages = Math.ceil(result.total / limit);

        return {
            projects: formattedProjects,
            pagination: {
                totalItems: result.total,
                currentPage: Number(page),
                totalPages,
                hasNextPage: page < totalPages
            }
        };
    }

    async createDraftProject(organizerId, projectData) {
        const coverPayload = Array.isArray(projectData.coverMedia) ? projectData.coverMedia : (projectData.coverMedia ? [projectData.coverMedia] : []);
        const docsPayload = Array.isArray(projectData.documents) ? projectData.documents : [];

        let targetVolunteers = 0;
        if (projectData.needsVolunteers && projectData.volunteerRoles?.length > 0) {
            targetVolunteers = projectData.volunteerRoles.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
        } else {
            projectData.needsVolunteers = false;
            projectData.volunteerRoles = [];
        }

        const { validMediaIds: validCoverIds, newMediaToInsert: newCoverMedia } = await this._processMediaPayload(coverPayload, organizerId, 'project_cover');
        const { validMediaIds: validDocIds, newMediaToInsert: newDocMedia } = await this._processMediaPayload(docsPayload, organizerId, 'project_document');

        const allNewMediaToInsert = [...newCoverMedia, ...newDocMedia];
        const publicIdsToRollback = allNewMediaToInsert.map(m => m.publicId);

        try {
            const result = await this.transactionManager.runInTransaction(async (session) => {
                let finalCoverMediaData = null;
                const finalDocumentIds = [...validDocIds];

                if (allNewMediaToInsert.length > 0) {
                    const insertedMedia = await this.mediaRepository.createMany(allNewMediaToInsert, session);
                    insertedMedia.forEach(media => {
                        if (media.context === 'project_cover') {
                            finalCoverMediaData = { url: media.url, publicId: media.publicId, mediaType: media.mimetype.startsWith('video') ? 'video' : 'image' };
                        } else {
                            finalDocumentIds.push(media._id.toString());
                        }
                    });
                }

                if (!finalCoverMediaData && validCoverIds.length > 0) {
                    const existingCover = await this.mediaRepository.findById(validCoverIds[0]);
                    if (existingCover) {
                        finalCoverMediaData = { url: existingCover.url, publicId: existingCover.publicId, mediaType: existingCover.mimetype.startsWith('video') ? 'video' : 'image' };
                    }
                }

                const { coverMedia: _, documents: __, ...otherProjectData } = projectData;
                const newProjectData = {
                    ...otherProjectData,
                    stats: { targetVolunteers, currentVolunteers: 0 },
                    organizerId,
                    coverMedia: finalCoverMediaData || undefined,
                    documents: [...new Set(finalDocumentIds)],
                    status: PROJECT_STATUS.DRAFT,
                    currentAmount: 0
                };

                return await this.projectRepository.create(newProjectData, session);
            });

            return result;

        } catch (error) {
            if (publicIdsToRollback.length > 0) {
                this.jobQueue.addJob('project-maintenance', 'cleanup-old-media', { publicIds: publicIdsToRollback })
                    .catch(err => console.error('[Queue Error] Lỗi đẩy job dọn rác rollback:', err.message));
            }
            throw new AppError(`Tạo dự án thất bại: ${error.message}`, 400);
        }
    }

    async updateDraftProject(projectId, organizerId, updateData) {
        const existingProject = await this.projectRepository.findById(projectId);
        if (!existingProject) throw new AppError('Không tìm thấy bản nháp dự án', 404);
        if (existingProject.organizerId.toString() !== organizerId.toString()) throw new AppError('Bạn không có quyền', 403);
        if (existingProject.status !== PROJECT_STATUS.DRAFT) throw new AppError(`Chỉ có thể chỉnh sửa dự án Nháp.`, 400);

        let { deletedDocumentIds, coverMedia: _, documents: __, ...finalUpdateData } = updateData;
        if (!Array.isArray(deletedDocumentIds)) deletedDocumentIds = deletedDocumentIds ? [deletedDocumentIds] : [];

        if (finalUpdateData.needsVolunteers && finalUpdateData.volunteerRoles?.length > 0) {
            finalUpdateData['stats.targetVolunteers'] = finalUpdateData.volunteerRoles.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
        } else if (finalUpdateData.needsVolunteers === false) {
            finalUpdateData.volunteerRoles = [];
            finalUpdateData['stats.targetVolunteers'] = 0;
        }

        const coverPayload = Array.isArray(finalUpdateData.coverMedia) ? finalUpdateData.coverMedia : (finalUpdateData.coverMedia ? [finalUpdateData.coverMedia] : []);
        const docsPayload = Array.isArray(finalUpdateData.documents) ? finalUpdateData.documents : [];

        const { validMediaIds: validCoverIds, newMediaToInsert: newCoverMedia } = await this._processMediaPayload(coverPayload, organizerId, 'project_cover');
        const { validMediaIds: validDocIds, newMediaToInsert: newDocMedia } = await this._processMediaPayload(docsPayload, organizerId, 'project_document');

        const allNewMediaToInsert = [...newCoverMedia, ...newDocMedia];
        const publicIdsToRollback = allNewMediaToInsert.map(m => m.publicId);

        const oldCloudinaryIdsToClean = [];

        try {
            const updatedProject = await this.transactionManager.runInTransaction(async (session) => {
                let finalCoverMediaData = null;
                const finalDocumentIds = new Set(validDocIds);

                if (allNewMediaToInsert.length > 0) {
                    const insertedMedia = await this.mediaRepository.createMany(allNewMediaToInsert, session);
                    insertedMedia.forEach(media => {
                        if (media.context === 'project_cover') {
                            finalCoverMediaData = { url: media.url, publicId: media.publicId, mediaType: media.mimetype.startsWith('video') ? 'video' : 'image' };
                        } else {
                            finalDocumentIds.add(media._id.toString());
                        }
                    });
                }

                if (!finalCoverMediaData && validCoverIds.length > 0) {
                    const existingCover = await this.mediaRepository.findById(validCoverIds[0]);
                    if (existingCover) finalCoverMediaData = { url: existingCover.url, publicId: existingCover.publicId, mediaType: existingCover.mimetype.startsWith('video') ? 'video' : 'image' };
                }

                if (finalCoverMediaData && existingProject.coverMedia?.publicId && existingProject.coverMedia.publicId !== finalCoverMediaData.publicId) {
                    oldCloudinaryIdsToClean.push(existingProject.coverMedia.publicId);
                }

                if (finalCoverMediaData) {
                    finalUpdateData.coverMedia = finalCoverMediaData;
                } else if (validCoverIds.length > 0) {
                    const existingCover = await this.mediaRepository.findById(validCoverIds[0]);
                    if (existingCover) {
                        finalUpdateData.coverMedia = {
                            url: existingCover.url,
                            publicId: existingCover.publicId,
                            mediaType: existingCover.mimetype.startsWith('video') ? 'video' : 'image'
                        };
                    }
                }

                if (deletedDocumentIds.length > 0) {
                    const mediaDocsToDelete = await this.mediaRepository.findManyByIdsAndOwner(deletedDocumentIds, organizerId, session);

                    const actualIdsToDelete = mediaDocsToDelete.map(m => m._id);
                    mediaDocsToDelete.forEach(media => { if (media.publicId) oldCloudinaryIdsToClean.push(media.publicId); });

                    if (actualIdsToDelete.length > 0) {
                        await Promise.all(actualIdsToDelete.map(id => this.mediaRepository.deleteById(id, session)));
                    }
                }

                const existingDocIdsStr = (existingProject.documents || []).map(id => id.toString());
                const docsToSave = [...existingDocIdsStr, ...Array.from(finalDocumentIds)]
                    .filter(id => !deletedDocumentIds.includes(id));

                finalUpdateData.documents = [...new Set(docsToSave)];

                const resultDoc = await this.projectRepository.updateDraftAtomic(projectId, organizerId, finalUpdateData, session);
                if (!resultDoc) throw new AppError('Xung đột hệ thống: Dự án đã đổi trạng thái hoặc bị khoá bởi luồng khác!', 409);

                return resultDoc;
            });

            if (oldCloudinaryIdsToClean.length > 0) {
                this.jobQueue.addJob('project-maintenance', 'cleanup-old-media', { publicIds: oldCloudinaryIdsToClean })
                    .catch(err => console.error('[Queue Error] Lỗi đẩy job dọn ảnh cũ:', err.message));
            }

            return updatedProject;

        } catch (error) {
            if (publicIdsToRollback.length > 0) {
                this.jobQueue.addJob('project-maintenance', 'cleanup-old-media', { publicIds: publicIdsToRollback })
                    .catch(err => console.error('[Queue Error] Lỗi đẩy job dọn rác rollback:', err.message));
            }
            if (error instanceof AppError) throw error;
            throw new AppError(`Cập nhật dự án thất bại: ${error.message}`, 400);
        }
    }
}

export default ProjectService;