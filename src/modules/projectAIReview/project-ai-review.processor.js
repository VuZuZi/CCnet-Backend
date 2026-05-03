class ProjectAIReviewProcessor {
  constructor({ projectAIReviewService, aiProviderFactory }) {
    this.projectAIReviewService = projectAIReviewService;
    this.aiProviderFactory = aiProviderFactory;
  }

  getProcessor() {
    return async (job) => {
      const runId = job?.data?.runId;
      if (!runId) return null;
      return this.projectAIReviewService.processRun(runId, this.aiProviderFactory);
    };
  }
}

export default ProjectAIReviewProcessor;
