class ReviewWorkflowReconciler {
  constructor({ volunteerEngagementService }) {
    this.volunteerEngagementService = volunteerEngagementService;
    this.intervalId = null;
    this.isRunning = false;
  }

  async runOnce() {
    if (this.isRunning) {
      return [];
    }

    this.isRunning = true;

    try {
      return await this.volunteerEngagementService.reconcileCompletedProjectReviews();
    } catch (error) {
      console.error(
        "❌ [ReviewWorkflowReconciler] reconcile failed:",
        error?.message || error
      );
      return [];
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    if (this.intervalId) {
      return;
    }

    this.intervalId = setInterval(() => {
      this.runOnce().catch((error) => {
        console.error(
          "❌ [ReviewWorkflowReconciler] interval run failed:",
          error?.message || error
        );
      });
    }, 60 * 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export default ReviewWorkflowReconciler;