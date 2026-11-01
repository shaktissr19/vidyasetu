import { Router } from 'express';
import * as ctrl from '../controllers/public.controller';

const router = Router();

router.get('/overview', ctrl.overview);
router.get('/schools', ctrl.schools);
router.get('/homepage', ctrl.homepage);
router.get('/pages/learn', ctrl.learnPage);
router.get('/pages/modules/:slug', ctrl.modulePage);
router.get('/homepage/videos/:filename', ctrl.homepageVideo);

export = router;
