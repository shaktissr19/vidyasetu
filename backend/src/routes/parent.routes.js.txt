// routes/parent.routes.js
const router = require('express').Router();
const { z } = require('zod');
const ctrl = require('../controllers/parent.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

router.use(authenticate);
router.use(authorize('PARENT'));

const messageSchema = z.object({
  body: z.string().min(2).max(1000),
});

router.get('/children',                                        ctrl.getChildren);
router.get('/children/:studentId/dashboard',                   ctrl.getChildDashboard);
router.get('/children/:studentId/attendance',                  ctrl.getChildAttendance);
router.get('/children/:studentId/fees',                        ctrl.getChildFees);
router.get('/children/:studentId/messages',                    ctrl.getMessages);
router.post('/children/:studentId/messages', validate(messageSchema), ctrl.sendMessage);
router.get('/notifications',                                   ctrl.getNotifications);

module.exports = router;
