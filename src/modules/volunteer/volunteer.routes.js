import { Router } from 'express';
import { getContainer } from '../../container/index.js';
import { authenticate, authorize } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
// import { idParamSchema, listVolunteeringSchema } from './volunteer.validation.js';
import VolunteerController from './volunteer.controller.js';
import multer from 'multer';


const router = Router();

const execute = (action) => (req, res, next) => {
    console.log("+===================+");
    console.log("🔍 execute called with action:", action);

    const container = getContainer();
    console.log("🔍 Container exists:", !!container);

    const controller = container.resolve('volunteerController');
    console.log("🔍 Controller resolved:", !!controller);
    console.log("🔍 Controller methods:", controller ? Object.keys(controller) : 'N/A');

    if (!controller) {
        console.log("❌ Controller not found!");
        return res.status(500).json({ error: 'Controller not found' });
    }

    if (typeof controller[action] !== 'function') {
        console.log(`❌ Action '${action}' not found in controller`);
        return res.status(500).json({ error: `Action ${action} not found` });
    }

    console.log(`✅ Calling controller.${action}`);
    return controller[action](req, res, next);
};
router.post(
    '/submit',
    authenticate,
    execute('applyVolunteer')
);
// router.post(
//     '/submit',
//     authenticate,
//     async (req, res) => {
//         // console.log('\n🎯 ========== VOLUNTEER SUBMIT ==========');
//         // console.log('📡 Method:', req.method);
//         // console.log('📍 URL:', req.originalUrl);
//         // console.log('🔑 Headers:', {
//         //     authorization: req.headers.authorization ? 'Present' : 'Missing',
//         //     'content-type': req.headers['content-type']
//         // });
//         // // 👉 LOG BODY - DỮ LIỆU GỬI TỪ FRONTEND
//         // console.log('\n📦 REQUEST BODY:');
//         // console.log(JSON.stringify(req.body, null, 2));

//         // // Log từng field riêng
//         // console.log('\n📝 DETAILS:');
//         // console.log('  - opportunityId:', req.body.opportunityId);
//         // console.log('  - skills:', req.body.skills);
//         // console.log('  - motivation:', req.body.motivation);
//         // console.log('  - availability:', req.body.availability);

//         // // 👉 LOG USER (từ authenticate middleware)
//         // if (req.user) {
//         //     console.log('\n👤 USER INFO:');
//         //     console.log('  - id:', req.user.id);
//         //     console.log('  - email:', req.user.email);
//         //     console.log('  - role:', req.user.role);
//         // } else {
//         //     console.log('\n⚠️ No user info (authenticate may not have run)');
//         // }

//         // console.log('\n✅ Route handler completed');


//         // Kiểm tra xem body có được parse không
//         if (!req.body || Object.keys(req.body).length === 0) {
//             console.log('❌ req.body is empty!');
//         } else {
//             console.log('✅ req.body has data:', req.body);
//         }
//         try {
//             // Lấy data từ request
//             const { opportunityId, skills, motivation, availability } = req.body;
//             const volunteerId = req.user.id;

//             // Kiểm tra data
//             if (!opportunityId || !skills || !motivation || !availability) {
//                 return res.status(400).json({
//                     success: false,
//                     message: 'Thiếu thông tin bắt buộc'
//                 });
//             }

//             // // Gửi data đến service để xử lý
//             // const result = await volunteerService.applyVolunteer({
//             //     opportunityId,
//             //     volunteerId,
//             //     skills,
//             //     motivation,
//             //     availability

//             // });

//             execute(applyVolunteer)
//             // res.json({ received: req.body });

//             // Trả về kết quả cho frontend
//             return res.status(201).json({
//                 success: true,
//                 data: result,
//                 message: 'Đăng ký thành công'
//             });

//         } catch (error) {
//             console.error('❌ Error:', error);
//             return res.status(400).json({
//                 success: false,
//                 message: error.message
//             });
//         }
//         console.log('=====================================\n');

//     }, execute('applyVolunteer')

// );

// console.log(router.post('/apply/:projectId', VolunteerController.applyVolunteer));

// router.get(
//     '/volunteerer',
//     authenticate,
//     validate(listVolunteerSchema),
//     execute('volunteerer')
// );
// router.create();
// router.post(
//     '/project/:id/aplly',
//     authenticate,
//     validate(idParamSchema),
//     execute('volunteerUser')
// );

// router.delete(
//     '/users/:id/volunteer',
//     authenticate,
//     validate(idParamSchema),
//     execute('unvolunteerUser')
// );

// router.get(
//     '/users/:id/status',
//     authenticate,
//     validate(idParamSchema),
//     execute('statusUser')
// );

// router.get(
//     '/users/:id/stats',
//     validate(idParamSchema),
//     execute('statsUser')
// );

export default router;