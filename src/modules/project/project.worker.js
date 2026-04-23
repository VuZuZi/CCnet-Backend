import { getContainer } from "../../container/index.js";
import Project from "./project.model.js";
import { MILESTONE_STATUS, PROJECT_STATUS } from "./project.constant.js";
import { DOMAIN_EVENTS } from "../../config/notification.js";

const EXECUTION_ACTIVE_MILESTONE_STATUSES = new Set([
  MILESTONE_STATUS.PENDING,
  MILESTONE_STATUS.PARTIALLY_DISBURSED,
  MILESTONE_STATUS.DELAYED,
]);
const MILESTONE_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

const chunkArray = (array, chunkSize) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

const getCurrentExecutionMilestone = (project) => {
  const milestones = Array.isArray(project?.milestones) ? project.milestones : [];
  return (
    milestones.find((milestone) =>
      EXECUTION_ACTIVE_MILESTONE_STATUSES.has(String(milestone?.status)),
    ) || null
  );
};

const hasEvidenceActivity = (evidence) => {
  if (!evidence) return false;
  return ["PENDING", "APPROVED", "REVISION_REQUESTED", "REJECTED"].includes(
    String(evidence.status || "").toUpperCase(),
  );
};

export const processViewSync = async (job) => {
  console.log(`[Worker] Starting job ${job.name}: syncing project views.`);

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

    if (allKeys.length === 0) {
      return { success: true, message: "No new project views to sync." };
    }

    const keyChunks = chunkArray(allKeys, 1000);
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

        if (!Number.isNaN(val) && val > 0) {
          updates.push({ val, projectId: key.split(":")[1] });
        } else {
          keysToDelete.push(key);
        }
      });

      if (keysToDelete.length > 0) {
        redisClient.del(...keysToDelete).catch(() => {});
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
          console.error("[Worker] View sync bulkWrite failed, rolling back Redis.");
          const rollbackPipeline = redisClient.pipeline();
          updates.forEach((u) =>
            rollbackPipeline.incrby(`project:${u.projectId}:views`, u.val),
          );
          await rollbackPipeline.exec();
          throw dbError;
        }
      }
    }

    console.log(`[Worker] View sync completed for ${totalSynced} projects.`);
    return { success: true, syncedProjects: totalSynced };
  } catch (error) {
    console.error("[Worker] View sync failed:", error.message);
    throw error;
  }
};

export const processProjectFollower = async (job) => {
  const { projectId, action } = job.data;
  const incValue = action === "follow" ? 1 : -1;

  try {
    const project = await Project.findById(projectId);
    if (!project) {
      return { success: false, message: "Project not found." };
    }

    const currentCount = project.stats?.followerCount || 0;
    const newCount = Math.max(currentCount + incValue, 0);

    await Project.updateOne(
      { _id: projectId },
      { $set: { "stats.followerCount": newCount } },
    );

    console.log(`[Worker] Project ${projectId} follower count = ${newCount}.`);
    return { success: true };
  } catch (error) {
    console.error("[Worker] Follower sync failed:", error);
    throw error;
  }
};

export const processRevisionTimeout = async (job) => {
  const { projectId } = job.data;
  console.log(`[Worker] Checking revision timeout for project ${projectId}.`);

  const container = getContainer();
  const projectRepository = container.resolve("projectRepository");
  const userRepository = container.resolve("userRepository");
  const transactionManager = container.resolve("transactionManager");
  const eventBus = container.resolve("eventBus");

  try {
    const project = await projectRepository.findById(projectId);

    if (!project) {
      return { success: false, message: "Project not found." };
    }

    if (project.status !== PROJECT_STATUS.REVISION_REQUESTED) {
      console.log(
        `[Worker] Project ${projectId} is already ${project.status}. Skip timeout.`,
      );
      return { success: true, message: "Project status changed." };
    }

    await transactionManager.runInTransaction(async (session) => {
      const rejectionReason =
        "The system auto-rejected this project after 14 days without revision.";

      await projectRepository.updateById(
        projectId,
        {
          status: PROJECT_STATUS.REJECTED,
          rejectionReason,
        },
        session,
      );

      const coolingPeriodEnd = new Date();
      coolingPeriodEnd.setDate(coolingPeriodEnd.getDate() + 7);

      await userRepository.updateById(
        project.organizerId,
        { coolingPeriodEnd },
        session,
      );

      if (eventBus && typeof eventBus.emit === "function") {
        eventBus.emit(DOMAIN_EVENTS.PROJECT_STATUS_UPDATED, {
          recipientIds: [String(project.organizerId)],
          actorId: "system",
          projectId: project._id,
          projectName: project.title,
          status: PROJECT_STATUS.REJECTED,
          title: "Project auto-rejected",
          message: `Project "${project.title}" was auto-rejected after 14 days without the required revision. New project creation is locked for 7 days.`,
          actionUrl: `/projects/${project._id}`,
        });
      }
    });

    console.log(`[Worker] Auto-rejected project ${projectId}.`);
    return { success: true };
  } catch (error) {
    console.error(
      `[Worker] Revision timeout failed for project ${projectId}:`,
      error.message,
    );
    throw error;
  }
};

export const processFundingDeadlines = async (job) => {
  console.log(`[Worker] Starting job ${job.name}: scanning expired funding.`);

  const container = getContainer();
  const projectRepository = container.resolve("projectRepository");
  const eventBus = container.resolve("eventBus");
  const jobQueue = container.resolve("jobQueue");

  try {
    const now = new Date();
    const expiredProjects = await projectRepository.findExpiredFundingProjects(now, 50);

    if (!expiredProjects || expiredProjects.length === 0) {
      return { success: true, message: "No expired funding projects found." };
    }

    let processedCount = 0;

    for (const project of expiredProjects) {
      let nextStatus = null;
      let eventTitle = "";
      let eventMessage = "";

      const { currentAmount, targetAmount, mvpAmount } = project;

      if (currentAmount < mvpAmount) {
        nextStatus = PROJECT_STATUS.FAILED_FUNDING;
        eventTitle = "Funding failed";
        eventMessage = `Project "${project.title}" did not reach MVP before the funding deadline. The system is preparing donor refunds.`;

        await jobQueue.addJob(
          "financial-reconciliation",
          "process-auto-refund",
          { projectId: project._id },
          { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
        );
      } else if (currentAmount >= mvpAmount && currentAmount < targetAmount) {
        nextStatus = PROJECT_STATUS.ADJUSTMENT_REQUIRED;
        eventTitle = "Adjusted plan required";
        eventMessage = `Project "${project.title}" reached MVP but not the full target. Organizer must submit an adjusted plan within 48 hours.`;
      } else {
        nextStatus = PROJECT_STATUS.EXECUTING;
        eventTitle = "Funding completed";
        eventMessage = `Project "${project.title}" reached its funding target and moved to execution.`;
      }

      await projectRepository.transitionStatus(
        project._id,
        PROJECT_STATUS.FUNDING,
        nextStatus,
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
          actionUrl: `/projects/${project._id}`,
        });
      }

      processedCount++;
    }

    console.log(`[Worker] Funding deadline scan completed: ${processedCount} updated.`);
    return { success: true, processedCount };
  } catch (error) {
    console.error("[Worker] Funding deadline scan failed:", error.message);
    throw error;
  }
};

export const processExecutionMilestoneDeadlines = async (job) => {
  console.log(
    `[Worker] Starting job ${job.name}: scanning execution milestone deadlines.`,
  );

  const container = getContainer();
  const projectRepository = container.resolve("projectRepository");
  const milestoneEvidenceRepository = container.resolve("milestoneEvidenceRepository");
  const transactionRepository = container.resolve("transactionRepository");
  const transactionManager = container.resolve("transactionManager");

  try {
    const now = new Date();
    const projects = await Project.find({
      status: PROJECT_STATUS.EXECUTING,
      milestones: {
        $elemMatch: {
          status: { $in: Array.from(EXECUTION_ACTIVE_MILESTONE_STATUSES) },
          endDate: { $ne: null, $lt: now },
        },
      },
    })
      .select("_id title organizerId milestones status")
      .lean()
      .exec();

    if (!projects.length) {
      return { success: true, message: "No overdue execution milestones found." };
    }

    let alertedCount = 0;
    let failedCount = 0;

    for (const project of projects) {
      const milestone = getCurrentExecutionMilestone(project);
      if (!milestone?.endDate) continue;

      const milestoneDeadline = new Date(milestone.endDate);
      if (Number.isNaN(milestoneDeadline.getTime()) || milestoneDeadline > now) continue;

      const evidence = await milestoneEvidenceRepository.findByMilestone(
        project._id,
        milestone.milestoneId,
      );
      if (hasEvidenceActivity(evidence)) continue;

      const graceDeadline = new Date(
        milestoneDeadline.getTime() + MILESTONE_GRACE_PERIOD_MS,
      );

      if (
        String(milestone.status) !== MILESTONE_STATUS.DELAYED &&
        now <= graceDeadline
      ) {
        await projectRepository.updateMilestoneStatus(
          project._id,
          milestone.milestoneId,
          MILESTONE_STATUS.DELAYED,
        );

        await transactionManager.runInTransaction(async (session, dispatchEvent) => {
          dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
            recipientIds: [String(project.organizerId)],
            title: "Milestone overdue",
            message: `Milestone "${milestone.title}" of project "${project.title}" is overdue. You have 24 hours to submit evidence before the project is stopped.`,
          });
        });

        alertedCount++;
        continue;
      }

      if (now <= graceDeadline) continue;

      const didFailProject = await transactionManager.runInTransaction(
        async (session, dispatchEvent) => {
          const freshProject = await projectRepository.findById(project._id, session);
          if (!freshProject || freshProject.status !== PROJECT_STATUS.EXECUTING) {
            return false;
          }

          const freshMilestone = getCurrentExecutionMilestone(freshProject);
          if (!freshMilestone) return false;
          if (String(freshMilestone.milestoneId) !== String(milestone.milestoneId)) {
            return false;
          }

          const freshEvidence = await milestoneEvidenceRepository.findByMilestone(
            freshProject._id,
            freshMilestone.milestoneId,
            session,
          );
          if (hasEvidenceActivity(freshEvidence)) {
            return false;
          }

          const donorSummary = await transactionRepository.getDonorContributionSummary(
            freshProject._id,
            session,
          );
          const donorIds = donorSummary
            .map((item) => String(item?.donorId || ""))
            .filter(Boolean);

          await projectRepository.updateMilestoneStatus(
            freshProject._id,
            freshMilestone.milestoneId,
            MILESTONE_STATUS.FAILED,
            session,
          );
          await projectRepository.updateById(
            freshProject._id,
            { status: PROJECT_STATUS.FAILED_EXECUTION },
            session,
          );

          dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
            recipientIds: [String(freshProject.organizerId)],
            title: "Project execution stopped",
            message: `Project "${freshProject.title}" was stopped because milestone "${freshMilestone.title}" stayed overdue beyond the 24-hour grace period.`,
          });

          if (donorIds.length > 0) {
            dispatchEvent(DOMAIN_EVENTS.SYSTEM_NOTIFICATION, {
              recipientIds: donorIds,
              title: "Project execution stopped",
              message: `Project "${freshProject.title}" was stopped because the organizer did not complete milestone "${freshMilestone.title}" on time. Refund handling will continue in the reconciliation flow.`,
            });
          }

          dispatchEvent(DOMAIN_EVENTS.PROJECT_STATUS_UPDATED, {
            recipientIds: [String(freshProject.organizerId)],
            actorId: "system",
            projectId: freshProject._id,
            projectName: freshProject.title,
            status: PROJECT_STATUS.FAILED_EXECUTION,
            title: "Project moved to FAILED_EXECUTION",
            message: `Project "${freshProject.title}" failed during execution because the current milestone expired without evidence after the grace period.`,
            actionUrl: `/projects/${freshProject._id}`,
          });

          return true;
        },
      );

      if (didFailProject) {
        failedCount++;
      }
    }

    return { success: true, alertedCount, failedCount };
  } catch (error) {
    console.error("[Worker] Execution milestone deadline scan failed:", error.message);
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
          return processProjectFollower(job);
        }

        if (job.name === "check-revision-timeout") {
          return processRevisionTimeout(job);
        }

        if (job.name === "check-funding-deadlines") {
          return processFundingDeadlines(job);
        }

        if (job.name === "check-execution-milestone-deadlines") {
          return processExecutionMilestoneDeadlines(job);
        }

        return processViewSync(job);
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

    jobQueue.addJob(
      "project-maintenance",
      "check-execution-milestone-deadlines",
      {},
      {
        repeat: { pattern: "0 * * * *" },
        jobId: "unique-execution-milestone-deadlines-job",
      },
    );

    console.log("[Worker] Project workers started (Queue: project-maintenance).");
  } catch (error) {
    console.error("[Worker] Project worker init failed:", error);
  }
};
