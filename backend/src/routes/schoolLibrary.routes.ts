import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/library.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router=Router();
router.use(authenticate);
router.use(authorize('SCHOOL_ADMIN','SUPER_ADMIN','TEACHER'));

const bookSchema=z.object({title:z.string().trim().min(2).max(240),author:z.string().trim().max(180).optional().nullable(),isbn:z.string().trim().max(32).optional().nullable(),publisher:z.string().trim().max(160).optional().nullable(),category:z.string().trim().max(100).optional().nullable(),subject:z.string().trim().max(100).optional().nullable(),description:z.string().trim().max(3000).optional().nullable()});
const copySchema=z.object({accessionNumber:z.string().trim().min(1).max(80),shelfLocation:z.string().trim().max(80).optional().nullable(),conditionNotes:z.string().trim().max(500).optional().nullable()});
const accessSchema=z.object({canCirculate:z.boolean(),isActive:z.boolean()});
const issueSchema=z.object({copyId:z.string().uuid(),studentId:z.string().uuid(),dueAt:z.string().datetime(),note:z.string().trim().max(500).optional().nullable()});
const returnSchema=z.object({note:z.string().trim().max(500).optional().nullable()});

router.get('/catalog',ctrl.catalog);
router.get('/copies',ctrl.copies);
router.get('/loans',ctrl.schoolLoans);
router.get('/staff-access',ctrl.staffAccess);
router.post('/books',validate(bookSchema),ctrl.createBook);
router.post('/books/:bookId/copies',validate(copySchema),ctrl.createCopy);
router.put('/staff-access/:userId',validate(accessSchema),ctrl.setStaffAccess);
router.post('/loans',validate(issueSchema),ctrl.issueLoan);
router.patch('/loans/:loanId/return',validate(returnSchema),ctrl.returnLoan);

export = router;
