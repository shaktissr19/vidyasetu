import { Router } from 'express';
import * as ctrl from '../controllers/publicLearning.controller';

const router = Router();

router.get('/overview', ctrl.overview);
router.get('/resources', ctrl.resources);
router.get('/resources/:slug', ctrl.resource);
router.get('/sources', ctrl.sources);

export = router;
