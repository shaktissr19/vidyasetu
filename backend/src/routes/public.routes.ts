import { Router } from 'express';
import * as ctrl from '../controllers/public.controller';

const router = Router();

router.get('/overview', ctrl.overview);

export = router;
