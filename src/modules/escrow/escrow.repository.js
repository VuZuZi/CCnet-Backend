import EscrowAccount from "./escrow.model.js";

class EscrowRepository {
  async create(data, session = null) {
    const docs = await EscrowAccount.create([data], { session });
    return docs[0];
  }

  async findByProjectId(projectId, session = null) {
    return await EscrowAccount.findOne({ projectId }).session(session).lean().exec();
  }

  async incrementBalance(projectId, amount, session = null) {
    return await EscrowAccount.findOneAndUpdate(
      { projectId },
      {
        $inc: {
          availableBalance: amount,
          totalDeposited: amount > 0 ? amount : 0,
        },
      },
      { new: true, session }
    )
      .lean()
      .exec();
  }

  async recordRefund(projectId, amount, session = null) {
    return await EscrowAccount.findOneAndUpdate(
      { projectId },
      {
        $inc: {
          availableBalance: -amount,
          completedRefunds: amount,
        },
      },
      { new: true, session }
    )
      .lean()
      .exec();
  }

  async processUserRefundWithFee(
    projectId,
    originalAmount,
    refundAmount,
    penaltyFee,
    session = null
  ) {
    return await EscrowAccount.findOneAndUpdate(
      { projectId },
      {
        $inc: {
          availableBalance: -originalAmount,
          completedRefunds: refundAmount,
          platformFeeCollected: penaltyFee,
        },
      },
      { new: true, runValidators: true, session }
    )
      .lean()
      .exec();
  }
}

export default EscrowRepository;