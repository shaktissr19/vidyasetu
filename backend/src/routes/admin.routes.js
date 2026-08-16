// routes/admin.routes.js
const router = require('express').Router();
const { z } = require('zod');
const ctrl = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const configSchema = z.object({ value: z.string().min(1) });
const statusSchema = z.object({ status: z.string().min(1) });

router.get('/analytics',                                        ctrl.getAnalytics);
router.get('/revenue',                                          ctrl.getRevenue);
router.get('/schools',                                          ctrl.listSchools);
router.patch('/schools/:schoolId/status', validate(statusSchema), ctrl.updateSchoolStatus);
router.get('/users',                                            ctrl.listUsers);
router.patch('/users/:userId/status',   validate(statusSchema), ctrl.updateUserStatus);
router.get('/config',                                           ctrl.getConfig);
router.patch('/config/:key',            validate(configSchema), ctrl.updateConfig);

module.exports = router;

// Support tickets
router.get('/support',                ctrl.getTickets);
router.patch('/support/:ticketId',    ctrl.updateTicket);

// Config via body (not url param)
router.patch('/config',              ctrl.updateConfigBody);

// Competitions (proxy to competition routes)
router.get('/competitions',           ctrl.listCompetitions);
router.post('/competitions',          ctrl.createCompetition);
