class VolunteerProcessor {
  constructor({ userRepository }) {
    this.userRepository = userRepository;
  }

  getProcessor() {
    return async (job) => {
      const { volunteererId, volunteeringId, action } = job.data;
      const isVolunteer = action === 'volunteer';

      try {
        console.log(`[VolunteerProcessor] Processing ${action} for Volunteerer: ${volunteererId} -> Volunteering: ${volunteeringId}`);

        await this.userRepository.updateCounters(volunteererId, {
          volunteeringCount: isVolunteer ? 1 : -1
        });

        await this.userRepository.updateCounters(volunteeringId, {
          volunteerersCount: isVolunteer ? 1 : -1
        });

        return { success: true };
      } catch (error) {
        console.error(`[VolunteerProcessor] Critical Error processing job ${job.id}:`, error.message);
        throw error;
      }
    };
  }
}

export default VolunteerProcessor;