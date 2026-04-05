import { getContainer } from "../../container/index.js";
import Project from "./project.model.js";

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
    // Tìm dự án hiện tại
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

    console.log(
      "[Worker] Project workers đã khởi chạy (Queue: project-maintenance)",
    );
  } catch (error) {
    console.error("[Worker] Khởi tạo Project workers thất bại:", error);
  }
};
