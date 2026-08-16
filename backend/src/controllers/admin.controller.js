// controllers/admin.controller.js
const adminService = require('../services/admin.service');
const R = require('../utils/response');

async function getAnalytics(req, res, next) {
  try {
    const data = await adminService.getPlatformAnalytics();
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function getRevenue(req, res, next) {
  try {
    const data = await adminService.getRevenueAnalytics();
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function listSchools(req, res, next) {
  try {
    const result = await adminService.listSchools(req.query, {
      status: req.query.status, state: req.query.state,
      plan: req.query.plan, search: req.query.search,
    });
    return R.ok(res, result.schools, result.meta);
  } catch (err) { next(err); }
}

async function updateSchoolStatus(req, res, next) {
  try {
    const school = await adminService.updateSchoolStatus(req.params.schoolId, req.body.status, req.user.userId);
    return R.ok(res, school);
  } catch (err) { next(err); }
}

async function listUsers(req, res, next) {
  try {
    const result = await adminService.listUsers(req.query, {
      role: req.query.role, status: req.query.status, search: req.query.search,
    });
    return R.ok(res, result.users, result.meta);
  } catch (err) { next(err); }
}

async function updateUserStatus(req, res, next) {
  try {
    const user = await adminService.updateUserStatus(req.params.userId, req.body.status, req.user.userId);
    return R.ok(res, user);
  } catch (err) { next(err); }
}

async function getConfig(req, res, next) {
  try {
    const config = await adminService.getPlatformConfig();
    return R.ok(res, config);
  } catch (err) { next(err); }
}

async function updateConfig(req, res, next) {
  try {
    const cfg = await adminService.updatePlatformConfig(req.params.key, req.body.value, req.user.userId);
    return R.ok(res, cfg);
  } catch (err) { next(err); }
}

// (exports moved to bottom)

// Appended methods

async function getTickets(req, res, next) {
  try {
    const { query } = require('../config/db');
    const status = req.query.status;
    const conds  = ['1=1'];
    const vals   = [];
    if (status) { conds.push(`st.status=$${vals.length+1}`); vals.push(status); }
    const { rows } = await query(
      `SELECT st.*,u.name AS raised_by_name,s.name AS school_name
       FROM support_tickets st
       JOIN users u ON u.id=st.raised_by
       LEFT JOIN schools s ON s.id=st.school_id
       WHERE ${conds.join(' AND ')} ORDER BY st.created_at DESC LIMIT 100`,
      vals
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function updateTicket(req, res, next) {
  try {
    const { query } = require('../config/db');
    const { status, resolution } = req.body;
    const { rows } = await query(
      `UPDATE support_tickets SET status=$1,resolution=$2,closed_at=CASE WHEN $1='RESOLVED' THEN NOW() ELSE NULL END,updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [status || 'RESOLVED', resolution || null, req.params.ticketId]
    );
    return R.ok(res, rows[0]);
  } catch (err) { next(err); }
}

async function updateConfigBody(req, res, next) {
  try {
    const cfg = await adminService.updatePlatformConfig(req.body.key, req.body.value, req.user.userId);
    return R.ok(res, cfg);
  } catch (err) { next(err); }
}

async function listCompetitions(req, res, next) {
  try {
    const { query } = require('../config/db');
    const { rows } = await query(
      `SELECT e.*,u.name AS created_by_name FROM exams e JOIN users u ON u.id=e.created_by
       WHERE e.type='OLYMPIAD' ORDER BY e.start_time DESC LIMIT 50`
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function createCompetition(req, res, next) {
  try {
    const { query } = require('../config/db');
    const { title, title_hi, description, class_names, subject_codes, total_questions, duration_mins,
            marks_per_question, negative_marks, start_time, end_time, prize_pool } = req.body;
    const { rows } = await query(
      `INSERT INTO exams (created_by,title,title_hi,description,type,status,class_names,subject_codes,
        total_questions,duration_mins,marks_per_question,negative_marks,start_time,end_time,prize_pool)
       VALUES ($1,$2,$3,$4,'OLYMPIAD','DRAFT',$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [req.user.userId, title, title_hi||null, description||null,
       class_names||[], subject_codes||[], total_questions||30, duration_mins||60,
       marks_per_question||4, negative_marks||1, start_time, end_time, prize_pool||0]
    );
    return R.ok(res, rows[0]);
  } catch (err) { next(err); }
}

module.exports = {
  getAnalytics, getRevenue, listSchools, updateSchoolStatus,
  listUsers, updateUserStatus, getConfig, updateConfig,
  getTickets, updateTicket, updateConfigBody, listCompetitions, createCompetition,
};
