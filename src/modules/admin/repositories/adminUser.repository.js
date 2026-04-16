import mongoose from "mongoose";
import User from "../../user/user.model.js";

const USER_SELECT_FIELDS =
  "fullName email avatar role status isActive isVerified createdAt updatedAt phone location headline about coolingPeriodEnd kyc";

class AdminUserRepository {
  async findAllUsers() {
    return await User.find()
      .select(USER_SELECT_FIELDS)
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findUsers({ search = "", page = 1, limit = 20, role = "" } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const filter = {};

    if (role) {
      filter.role = String(role).trim().toLowerCase();
    }

    if (String(search || "").trim()) {
      const keyword = String(search).trim();
      const regex = { $regex: keyword, $options: "i" };

      const searchConditions = [
        { fullName: regex },
        { email: regex },
        { role: regex },
      ];

      if (mongoose.Types.ObjectId.isValid(keyword)) {
        searchConditions.push({ _id: new mongoose.Types.ObjectId(keyword) });
      }

      filter.$or = searchConditions;
    }

    const [items, total] = await Promise.all([
      User.find(filter)
        .select(USER_SELECT_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      User.countDocuments(filter),
    ]);

    return {
      items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  async findUserById(id) {
    return await User.findById(id);
  }

  async updateUser(id, updateData, options = {}) {
    return await User.findByIdAndUpdate(id, updateData, {
      new: true,
      ...options,
    });
  }

  async updateUserCoolingPeriod(userId, endDate, session = null) {
    return await User.findByIdAndUpdate(
      userId,
      { $set: { coolingPeriodEnd: endDate } },
      { new: true, session }
    )
      .lean()
      .exec();
  }
}

export default AdminUserRepository;