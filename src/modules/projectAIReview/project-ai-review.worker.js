import { getContainer } from "../../container/index.js";
import { PROJECT_AI_REVIEW_QUEUE } from "./project-ai-review.constant.js";

export const initProjectAIReviewWorker = () => {
  const container = getContainer();
  const jobQueue = container.resolve("jobQueue");

  jobQueue.registerWorker(
    PROJECT_AI_REVIEW_QUEUE,
    async (job) => {
      const projectAIReviewProcessor = container.resolve("projectAIReviewProcessor");
      return projectAIReviewProcessor.getProcessor()(job);
    },
    { concurrency: 1 }
  );

  console.log("[Worker] Project AI review worker started.");
};
