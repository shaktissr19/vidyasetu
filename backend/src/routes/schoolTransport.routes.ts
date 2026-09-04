import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/transport.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('SCHOOL_ADMIN','SUPER_ADMIN'));

const phone = z.string().trim().min(7).max(20);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/).optional().nullable();
const vehicle = z.object({
  registrationNumber: z.string().trim().min(3).max(30),
  label: z.string().trim().min(2).max(80),
  vehicleType: z.enum(['BUS','VAN','AUTO','OTHER']),
  capacity: z.number().int().min(1).max(100),
  driverName: z.string().trim().min(2).max(120),
  driverPhone: phone,
  attendantName: z.string().trim().max(120).optional().nullable(),
  attendantPhone: z.string().trim().max(20).optional().nullable(),
  status: z.enum(['ACTIVE','MAINTENANCE','INACTIVE']).optional(),
});
const vehiclePatch = vehicle.partial();
const route = z.object({
  routeCode: z.string().trim().min(1).max(30),
  name: z.string().trim().min(2).max(120),
  vehicleId: z.string().uuid().optional().nullable(),
  morningStart: time,
  afternoonStart: time,
  status: z.enum(['ACTIVE','INACTIVE']).optional(),
});
const stop = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(300).optional().nullable(),
  sequenceNo: z.number().int().min(1).max(200),
  pickupTime: time,
  dropTime: time,
  isActive: z.boolean().optional(),
});
const assignment = z.object({
  routeId: z.string().uuid(),
  stopId: z.string().uuid(),
  authorizedPickupName: z.string().trim().max(120).optional().nullable(),
  authorizedPickupPhone: z.string().trim().max(20).optional().nullable(),
  authorizedPickupRelation: z.string().trim().max(60).optional().nullable(),
});
const event = z.object({
  studentId: z.string().uuid(),
  eventType: z.enum(['PICKED_UP','DROPPED_AT_SCHOOL','BOARDED_RETURN','DROPPED_HOME','MISSED_BUS']),
  note: z.string().trim().max(300).optional().nullable(),
});

router.get('/vehicles', ctrl.vehicles);
router.post('/vehicles', validate(vehicle), ctrl.createVehicle);
router.patch('/vehicles/:vehicleId', validate(vehiclePatch), ctrl.updateVehicle);
router.get('/routes', ctrl.routes);
router.post('/routes', validate(route), ctrl.createRoute);
router.post('/routes/:routeId/stops', validate(stop), ctrl.createStop);
router.get('/assignments', ctrl.assignments);
router.put('/assignments/:studentId', validate(assignment), ctrl.assignStudent);
router.get('/manifest', ctrl.manifest);
router.post('/events', validate(event), ctrl.recordEvent);

export = router;
