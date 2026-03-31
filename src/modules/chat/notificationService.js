// src/features/chat/services/notificationService.js
import toast from 'react-hot-toast';

class NotificationService {
    constructor() {
        this.sound = null;
        this.isEnabled = true;
    }

    // Khởi tạo audio
    init() {
        if (typeof window !== 'undefined') {
            this.sound = new Audio('/notification.mp3');
        }
    }

    // Hiển thị thông báo tin nhắn mới dạng custom toast
    showNewMessageNotification(senderName, message, avatar, conversationId, onOpenConversation) {
        if (!this.isEnabled) return;

        // Tạo ID duy nhất cho toast
        const toastId = `msg-${conversationId}-${Date.now()}`;

        // Hiển thị toast custom
        toast.custom(
            (t) => (
                <div
                    className={`${
                        t.visible ? 'animate-in slide-in-from-right-full fade-in duration-300' : 'animate-out slide-out-to-right-full fade-out duration-200'
                    } max-w-md w-full bg-white shadow-xl rounded-2xl pointer-events-auto flex ring-1 ring-black ring-opacity-5 cursor-pointer hover:shadow-2xl transition-all`}
                    onClick={() => {
                        toast.dismiss(t.id);
                        if (onOpenConversation) {
                            onOpenConversation(conversationId);
                        }
                    }}
                >
                    <div className="flex-1 w-0 p-4">
                        <div className="flex items-start gap-3">
                            {/* Avatar */}
                            <div className="flex-shrink-0 pt-0.5">
                                {avatar ? (
                                    <img
                                        className="h-12 w-12 rounded-full object-cover ring-2 ring-amber-200"
                                        src={avatar}
                                        alt={senderName}
                                    />
                                ) : (
                                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
                                        {senderName?.charAt(0)?.toUpperCase() || 'U'}
                                    </div>
                                )}
                            </div>

                            {/* Nội dung */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900">
                                    {senderName}
                                </p>
                                <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                                    {message}
                                </p>
                                <p className="mt-1 text-xs text-gray-400">
                                    Vừa gửi tin nhắn mới
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Nút đóng */}
                    <div className="flex border-l border-gray-100">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                toast.dismiss(t.id);
                            }}
                            className="w-full border border-transparent rounded-none rounded-r-2xl p-4 flex items-center justify-center text-sm font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors focus:outline-none"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            ),
            {
                id: toastId,
                duration: 5000,
                position: 'top-right',
            }
        );

        // Phát âm thanh
        if (this.sound) {
            this.sound.play().catch(e => console.log('Audio play failed:', e));
        }
    }

    // Hiển thị thông báo lỗi
    showError(message) {
        toast.error(message, {
            duration: 3000,
            position: 'top-right',
            icon: '❌',
            style: {
                background: '#fee2e2',
                color: '#991b1b',
                borderRadius: '12px',
                padding: '12px 16px',
            },
        });
    }

    // Hiển thị thông báo thành công
    showSuccess(message) {
        toast.success(message, {
            duration: 2000,
            position: 'top-right',
            icon: '✅',
            style: {
                background: '#dcfce7',
                color: '#166534',
                borderRadius: '12px',
                padding: '12px 16px',
            },
        });
    }

    // Bật/tắt thông báo
    toggleNotifications() {
        this.isEnabled = !this.isEnabled;
        return this.isEnabled;
    }
}

export default new NotificationService();