class VolunteerReviewProcessor {
  constructor({ volunteerEngagementService }) {
    this.volunteerEngagementService = volunteerEngagementService;
  }

  getProcessor() {
    return async (job) => {
      switch (job.name) {
        case "auto-review":
          return this.handleAutoReview(job);
        default:
          throw new Error(`Unsupported job: ${job.name}`);
      }
    };
  }

  async handleAutoReview(job) {
    const { reviewId } = job.data || {};

    if (!reviewId) {
      throw new Error("Missing reviewId");
    }

    return this.volunteerEngagementService.autoFinalizeReview(reviewId);
  }
}

export default VolunteerReviewProcessor;