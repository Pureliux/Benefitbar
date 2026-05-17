import express from 'express';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

const router = express.Router();

// POST /submissions - Create new submission
router.post('/', async (req, res) => {
  const { employeeId, benefitYearId, selectedBenefits } = req.body;

  // Validate inputs
  if (!employeeId || !benefitYearId || !Array.isArray(selectedBenefits)) {
    return res.status(400).json({ error: 'Missing required fields: employeeId, benefitYearId, selectedBenefits' });
  }

  if (selectedBenefits.length === 0) {
    return res.status(400).json({ error: 'At least one benefit must be selected' });
  }

  // Validate employee exists and is active
  const employee = await pb.collection('employees').getOne(employeeId);
  if (!employee || employee.status !== 'active') {
    throw new Error('Employee not found or inactive');
  }

  // Validate eligibility (today >= eligibleFrom)
  const today = new Date();
  const eligibleFrom = new Date(employee.eligibleFrom);
  if (today < eligibleFrom) {
    throw new Error('Employee is not yet eligible for benefits');
  }

  // Get benefit year to access annualBudget
  const benefitYear = await pb.collection('benefitYears').getOne(benefitYearId);
  if (!benefitYear) {
    throw new Error('Benefit year not found');
  }

  // Calculate amounts
  let totalSelectedAmount = 0;
  for (const benefit of selectedBenefits) {
    if (!benefit.requestedAmount || benefit.requestedAmount < 0) {
      return res.status(400).json({ error: 'Invalid requestedAmount in selectedBenefits' });
    }
    totalSelectedAmount += benefit.requestedAmount;
  }

  const annualBudget = benefitYear.annualBudget || 0;
  const coveredByCompanyAmount = Math.min(totalSelectedAmount, annualBudget);
  const employeeOwnContributionAmount = totalSelectedAmount - coveredByCompanyAmount;

  // Create submission record
  const submission = await pb.collection('submissions').create({
    employeeId,
    benefitYearId,
    status: 'draft',
    totalSelectedAmount,
    coveredByCompanyAmount,
    employeeOwnContributionAmount,
    submittedAt: null,
  });

  // Create selectedBenefits records
  for (const benefit of selectedBenefits) {
    await pb.collection('selectedBenefits').create({
      submissionId: submission.id,
      benefitId: benefit.benefitId,
      requestedAmount: benefit.requestedAmount,
      payoutMode: benefit.payoutMode || 'cash',
    });
  }

  // Log action
  await pb.collection('auditLog').create({
    action: 'submission_created',
    entityType: 'submission',
    entityId: submission.id,
    beforeValue: null,
    afterValue: JSON.stringify(submission),
  });

  logger.info(`Submission created: ${submission.id} for employee ${employeeId}`);

  res.json({
    id: submission.id,
    employeeId,
    benefitYearId,
    status: 'draft',
    totalSelectedAmount,
    coveredByCompanyAmount,
    employeeOwnContributionAmount,
    selectedBenefits,
  });
});

// PUT /submissions/:submissionId - Update submission
router.put('/:submissionId', async (req, res) => {
  const { submissionId } = req.params;
  const { status, selectedBenefits, adminComment, needsInfoReason } = req.body;

  // Get submission
  const submission = await pb.collection('submissions').getOne(submissionId);
  if (!submission) {
    throw new Error('Submission not found');
  }

  // Validate user owns submission or is admin
  const userEmail = req.auth?.email;
  if (!userEmail) {
    throw new Error('User not authenticated');
  }

  const employee = await pb.collection('employees').getFirstListItem(`email = "${userEmail}"`);
  const isAdmin = employee?.isAdmin || false;

  if (submission.employeeId !== employee?.id && !isAdmin) {
    throw new Error('Unauthorized: You do not own this submission');
  }

  const beforeValue = JSON.stringify(submission);
  const updateData = {};

  // Handle status changes
  if (status) {
    if (status === 'submitted') {
      // Validate all required receipts uploaded and confirmation checked
      const selectedBenefitsRecords = await pb.collection('selectedBenefits').getFullList({
        filter: `submissionId = "${submissionId}"`,
      });

      for (const sb of selectedBenefitsRecords) {
        const attachments = await pb.collection('attachments').getFullList({
          filter: `selectedBenefitId = "${sb.id}"`,
        });
        if (attachments.length === 0) {
          throw new Error(`Missing receipt for benefit ${sb.benefitId}`);
        }
      }

      updateData.status = 'submitted';
      updateData.submittedAt = new Date().toISOString();
    } else if (status === 'needs_info' && isAdmin) {
      updateData.status = 'needs_info';
      if (needsInfoReason) {
        updateData.needsInfoReason = needsInfoReason;
      }
    } else if ((status === 'approved' || status === 'rejected') && isAdmin) {
      updateData.status = status;
      if (adminComment) {
        updateData.adminComment = adminComment;
      }
    } else if (status !== submission.status) {
      throw new Error(`Invalid status transition or insufficient permissions`);
    }
  }

  // Recalculate budget amounts if selectedBenefits changed
  if (selectedBenefits && Array.isArray(selectedBenefits)) {
    let totalSelectedAmount = 0;
    for (const benefit of selectedBenefits) {
      if (!benefit.requestedAmount || benefit.requestedAmount < 0) {
        return res.status(400).json({ error: 'Invalid requestedAmount in selectedBenefits' });
      }
      totalSelectedAmount += benefit.requestedAmount;
    }

    const benefitYear = await pb.collection('benefitYears').getOne(submission.benefitYearId);
    const annualBudget = benefitYear.annualBudget || 0;
    const coveredByCompanyAmount = Math.min(totalSelectedAmount, annualBudget);
    const employeeOwnContributionAmount = totalSelectedAmount - coveredByCompanyAmount;

    updateData.totalSelectedAmount = totalSelectedAmount;
    updateData.coveredByCompanyAmount = coveredByCompanyAmount;
    updateData.employeeOwnContributionAmount = employeeOwnContributionAmount;
  }

  // Update submission
  const updatedSubmission = await pb.collection('submissions').update(submissionId, updateData);

  // Log action
  await pb.collection('auditLog').create({
    action: 'submission_updated',
    entityType: 'submission',
    entityId: submissionId,
    beforeValue,
    afterValue: JSON.stringify(updatedSubmission),
  });

  logger.info(`Submission updated: ${submissionId}`);

  res.json(updatedSubmission);
});

export default router;
