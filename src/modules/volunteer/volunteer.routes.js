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
    const container = getContainer();
    const controller = container.resolve('volunteerController');
    return controller[action](req, res, next);
};
console.log("+=====================+");
// router.post(
//     '/volunteer/submit',
//     authenticate,
//     execute('applyVolunteer')
// );

router.post(
    '/submit',
    authenticate,
    async (req, res) => {
        console.log('\n🎯 ========== VOLUNTEER SUBMIT ==========');
        console.log('📡 Method:', req.method);
        console.log('📍 URL:', req.originalUrl);
        console.log('🔑 Headers:', {
            authorization: req.headers.authorization ? 'Present' : 'Missing',
            'content-type': req.headers['content-type']
        });
        // 👉 LOG BODY - DỮ LIỆU GỬI TỪ FRONTEND
        console.log('\n📦 REQUEST BODY:');
        console.log(JSON.stringify(req.body, null, 2));

        // // Log từng field riêng
        // console.log('\n📝 DETAILS:');
        // console.log('  - opportunityId:', req.body.opportunityId);
        // console.log('  - skills:', req.body.skills);
        // console.log('  - motivation:', req.body.motivation);
        // console.log('  - availability:', req.body.availability);

        // // 👉 LOG USER (từ authenticate middleware)
        // if (req.user) {
        //     console.log('\n👤 USER INFO:');
        //     console.log('  - id:', req.user.id);
        //     console.log('  - email:', req.user.email);
        //     console.log('  - role:', req.user.role);
        // } else {
        //     console.log('\n⚠️ No user info (authenticate may not have run)');
        // }

        // console.log('\n✅ Route handler completed');


        // Kiểm tra xem body có được parse không
        if (!req.body || Object.keys(req.body).length === 0) {
            console.log('❌ req.body is empty!');
        } else {
            console.log('✅ req.body has data:', req.body);
        }

        res.json({ received: req.body });

        console.log('=====================================\n');
    });

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