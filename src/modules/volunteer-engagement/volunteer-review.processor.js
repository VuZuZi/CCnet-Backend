class VolunteerReviewProcessor {
  constructor({ volunteerEngagementService }) {
    this.volunteerEngagementService = volunteerEngagementService;
  }

  getProcessor() {
    return async (job) => {
      switch (job.name) {
        case "auto-max-review":
          return this.handleAutoMaxReview(job);
        default:
          throw new Error(`Unsupported job: ${job.name}`);
      }
    };
  }

  async handleAutoMaxReview(job) {
    const { reviewId } = job.data || {};

    if (!reviewId) {
      throw new Error("Missing reviewId");
    }

    return this.volunteerEngagementService.autoMaxReview(reviewId);
  }
}

export default VolunteerReviewProcessor;