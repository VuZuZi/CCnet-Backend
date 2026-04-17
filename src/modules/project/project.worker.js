import { getContainer } from "../../container/index.js";
import Project from "./project.model.js";
import { PROJECT_STATUS } from "./project.constant.js";
import { DOMAIN_EVENTS } from "../../config/notification.js";

const chunkArray = (array, chunkSize) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

export const processViewSync = async (job) => {
  console.log(
    `[Worker] Starting job ${job.name}: Đang đồng bộ View an toàn...`,
  );

  try {
    const container = getContainer();
    const redis = container.resolve("redis");
    const redisClient = redis.getClient();

    let cursor = "0";
    const allKeys = [];

    do {
      const result = await redisClient.scan(
        cursor,
        "MATCH",
        "project:*:views",
        "COUNT",
        500,
      );
      cursor = result[0];
      allKeys.push(...result[1]);
    } while (cursor !== "0");

    if (allKeys.length === 0)
      return { success: true, message: "Không có lượt view mới." };

    const BATCH_SIZE = 1000;
    const keyChunks = chunkArray(allKeys, BATCH_SIZE);
    let totalSynced = 0;

    for (const chunk of keyChunks) {
      const pipeline = redisClient.pipeline();
      chunk.forEach((key) => pipeline.getset(key, 0));
      const pipelineResults = await pipeline.exec();

      const updates = [];
      const keysToDelete = [];

      chunk.forEach((key, index) => {
        const valStr = pipelineResults[index][1];
        const val = parseInt(valStr, 10);

        if (!isNaN(val) && val > 0) {
          const projectId = key.split(":")[1];
          updates.push({ val, projectId });
        } else {
          keysToDelete.push(key);
        }
      });

      if (keysToDelete.length > 0) {
        redisClient.del(...keysToDelete).catch(() => { });
      }

      if (updates.length > 0) {
        const bulkOperations = updates.map((u) => ({
          updateOne: {
            filter: { _id: u.projectId },
            update: { $inc: { "stats.viewCount": u.val } },
          },
        }));

        try {
          await Project.bulkWrite(bulkOperations, { ordered: false });
          totalSynced += bulkOperations.length;
        } catch (dbError) {
          console.error(
            `[Worker] DB BulkWrite Lỗi! Đang rollback view lại Redis...`,
          );
          const rbPipeline = redisClient.pipeline();
          updates.forEach((u) =>
            rbPipeline.incrby(`project:${u.projectId}:views`, u.val),
          );
          await rbPipeline.exec();
          throw dbError;
        }
      }
    }

    console.log(
      `[Worker] Hoàn tất. Đã đồng bộ an toàn view cho ${totalSynced} dự án.`,
    );
    return { success: true, syncedProjects: totalSynced };
  } catch (error) {
    console.error(`[Worker] [CRITICAL] Lỗi Sync View:`, error.message);
    throw error;
  }
};

export const processProjectFollower = async (job) => {
  const { projectId, action } = job.data;
  const incValue = action === "follow" ? 1 : -1;

  try {
    const project = await Project.findById(projectId);
    if (!project) return { success: false, message: "Dự án không tồn tại" };

    let currentCount = project.stats?.followerCount || 0;
    let newCount = currentCount + incValue;
    if (newCount < 0) newCount = 0;

    await Project.updateOne(
      { _id: projectId },
      { $set: { "stats.followerCount": newCount } },
    );

    console.log(
      `[Worker] Đã chốt sổ: Dự án ${projectId} có ${newCount} follower.`,
    );
    return { success: true };
  } catch (error) {
    console.error(`[Worker] Lỗi update follower:`, error);
    throw error;
  }
};

export const processRevisionTimeout = async (job) => {
  const { projectId } = job.data;
  console.log(`[Worker] Bắt đầu xử lý kiểm tra timeout 14 ngày cho dự án: ${projectId}`);

  const container = getContainer();
  const projectRepository = container.resolve("projectRepository");
  const userRepository = container.resolve("userRepository");
  const transactionManager = container.resolve("transactionManager");
  const eventBus = container.resolve("eventBus");

  try {
    const project = await projectRepository.findById(projectId);

    if (!project) {
      return { success: false, message: "Không tìm thấy dự án, có thể đã bị xóa." };
    }

    if (project.status !== PROJECT_STATUS.REVISION_REQUESTED) {
      console.log(`[Worker] Dự án ${projectId} đã thay đổi trạng thái (${project.status}). Bỏ qua timeout.`);
      return { success: true, message: "Project status changed, timeout ignored." };
    }

    await transactionManager.runInTransaction(async (session) => {
      const rejectionReason = "Hệ thống tự động từ chối do quá 14 ngày không bổ sung yêu cầu chỉnh sửa.";

      await projectRepository.updateById(
        projectId,
        {
          status: PROJECT_STATUS.REJECTED,
          rejectionReason: rejectionReason,
        },
        session
      );

      const coolingPeriodEnd = new Date();
      coolingPeriodEnd.setDate(coolingPeriodEnd.getDate() + 7);

      await userRepository.updateById(
        project.organizerId,
        { coolingPeriodEnd },
        session
      );

      if (eventBus && typeof eventBus.emit === "function") {
        eventBus.emit(DOMAIN_EVENTS.PROJECT_STATUS_UPDATED, {
          recipientIds: [String(project.organizerId)],
          actorId: "system",
          projectId: project._id,
          projectName: project.title,
          status: PROJECT_STATUS.REJECTED,
          title: "Dự án bị từ chối tự động (Quá hạn)",
          message: `Dự án "${project.title}" đã bị hệ thống từ chối do quá 14 ngày không cập nhật theo yêu cầu. Tài khoản của bạn bị tạm ngưng tạo dự án mới trong 7 ngày.`,
          actionUrl: `/projects/${project._id}`,
        });
      }
    });

    console.log(`[Worker] Đã Auto-Rejected dự án ${projectId} thành công.`);
    return { success: true };
  } catch (error) {
    console.error(`[Worker] [CRITICAL] Lỗi xử lý Revision Timeout cho dự án ${projectId}:`, error.message);
    throw error;
  }
};

export const processFundingDeadlines = async (job) => {
  console.log(`[Worker] Starting job ${job.name}: Quét dự án hết hạn gọi vốn...`);

  const container = getContainer();
  const projectRepository = container.resolve("projectRepository");
  const eventBus = container.resolve("eventBus");
  const jobQueue = container.resolve("jobQueue");

  try {
    const now = new Date();
    const expiredProjects = await projectRepository.findExpiredFundingProjects(now, 50);

    if (!expiredProjects || expiredProjects.length === 0) {
      return { success: true, message: "Không có dự án nào quá hạn gọi vốn." };
    }

    let processedCount = 0;

    for (const project of expiredProjects) {
      let nextStatus = null;
      let eventTitle = "";
      let eventMessage = "";

      const { currentAmount, targetAmount, mvpAmount } = project;

      if (currentAmount < mvpAmount) {
        nextStatus = PROJECT_STATUS.FAILED_FUNDING;
        eventTitle = "Dự án gọi vốn không thành công";
        eventMessage = `Dự án "${project.title}" đã kết thúc thời gian gọi vốn nhưng không đạt ngưỡng tối thiểu (MVP). Hệ thống đang tiến hành hoàn tiền 100% vào ví cho tất cả người ủng hộ.`;

        await jobQueue.addJob(
          "financial-reconciliation",
          "process-auto-refund",
          { projectId: project._id },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
        );

      } else if (currentAmount >= mvpAmount && currentAmount < targetAmount) {
        nextStatus = PROJECT_STATUS.ADJUSTMENT_REQUIRED;
        eventTitle = "Yêu cầu điều chỉnh kế hoạch dự án";
        eventMessage = `Dự án "${project.title}" đã đạt ngưỡng MVP nhưng chưa đạt 100% mục tiêu. Vui lòng nộp Kế hoạch điều chỉnh (Adjusted Plan) trong vòng 48 giờ.`;

      } else {
        nextStatus = PROJECT_STATUS.EXECUTING;
        eventTitle = "Dự án gọi vốn thành công";
        eventMessage = `Chúc mừng! Dự án "${project.title}" đã đạt mục tiêu gọi vốn và chính thức chuyển sang giai đoạn Thực thi.`;
      }

      await projectRepository.transitionStatus(
        project._id,
        PROJECT_STATUS.FUNDING,
        nextStatus
      );

      if (eventBus && typeof eventBus.emit === "function") {
        eventBus.emit(DOMAIN_EVENTS.PROJECT_STATUS_UPDATED, {
          recipientIds: [String(project.organizerId)],
          actorId: "system",
          projectId: project._id,
          projectName: project.title,
          status: nextStatus,
          title: eventTitle,
          message: eventMessage,
          actionUrl: `/projects/${project._id}`
        });
      }

      processedCount++;
    }

    console.log(`[Worker] Đã quét và xử lý trạng thái cho ${processedCount} dự án quá hạn.`);
    return { success: true, processedCount };
  } catch (error) {
    console.error(`[Worker] [CRITICAL] Lỗi xử lý Funding Deadlines:`, error.message);
    throw error;
  }
};

export const initProjectWorkers = () => {
  try {
    const container = getContainer();
    const jobQueue = container.resolve("jobQueue");

    jobQueue.registerWorker(
      "project-maintenance",
      async (job) => {
        if (
          job.name === "increment-project-follower" ||
          job.name === "decrement-project-follower"
        ) {
          return await processProjectFollower(job);
        }

        if (job.name === "check-revision-timeout") {
          return await processRevisionTimeout(job);
        }

        if (job.name === "check-funding-deadlines") {
          return await processFundingDeadlines(job);
        }

        return await processViewSync(job);
      },
      {
        concurrency: 1,
      },
    );

    jobQueue.addJob(
      "project-maintenance",
      "sync-views",
      {},
      {
        repeat: { pattern: "*/5 * * * *" },
        jobId: "unique-sync-views-job",
      },
    );

    jobQueue.addJob(
      "project-maintenance",
      "check-funding-deadlines",
      {},
      {
        repeat: { pattern: "*/10 * * * *" },
        jobId: "unique-funding-deadlines-job",
      },
    );

    console.log(
      "[Worker] Project workers đã khởi chạy (Queue: project-maintenance)",
    );
  } catch (error) {
    console.error("[Worker] Khởi tạo Project workers thất bại:", error);
  }
};