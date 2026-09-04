import { Router } from 'express';
import * as ctrl from '../controllers/studentDocuments.controller';

const router = Router();
router.get('/verify/:code', ctrl.verifyDocument);

export = router;
