import express from 'express';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

const router = express.Router();

const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// POST /attachments - Upload attachment
router.post('/', async (req, res) => {
  const { selectedBenefitId, file } = req.body;

  // Validate inputs
  if (!selectedBenefitId || !file) {
    return res.status(400).json({ error: 'Missing required fields: selectedBenefitId, file' });
  }

  // Validate file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return res.status(400).json({ error: 'Invalid file type. Allowed: PDF, JPG, PNG, DOCX' });
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return res.status(400).json({ error: 'File size exceeds 20MB limit' });
  }

  // Validate selectedBenefit exists
  const selectedBenefit = await pb.collection('selectedBenefits').getOne(selectedBenefitId);
  if (!selectedBenefit) {
    throw new Error('Selected benefit not found');
  }

  // Create FormData for PocketBase file upload
  const formData = new FormData();
  formData.append('selectedBenefitId', selectedBenefitId);
  formData.append('fileName', file.name);
  formData.append('fileType', file.type);
  formData.append('uploadedAt', new Date().toISOString());
  formData.append('file', file);

  // Store file in PocketBase
  const attachment = await pb.collection('attachments').create(formData);

  logger.info(`Attachment uploaded: ${attachment.id} for selectedBenefit ${selectedBenefitId}`);

  res.json({
    id: attachment.id,
    selectedBenefitId,
    fileName: attachment.fileName,
    fileUrl: pb.getFileUrl(attachment, attachment.file),
    fileType: attachment.fileType,
    uploadedAt: attachment.uploadedAt,
  });
});

// GET /attachments/:attachmentId - Get attachment
router.get('/:attachmentId', async (req, res) => {
  const { attachmentId } = req.params;

  // Get attachment
  const attachment = await pb.collection('attachments').getOne(attachmentId);
  if (!attachment) {
    throw new Error('Attachment not found');
  }

  // Validate user owns attachment or is admin
  const userEmail = req.auth?.email;
  if (!userEmail) {
    throw new Error('User not authenticated');
  }

  const employee = await pb.collection('employees').getFirstListItem(`email = "${userEmail}"`);
  const isAdmin = employee?.isAdmin || false;

  // Get selectedBenefit to check ownership
  const selectedBenefit = await pb.collection('selectedBenefits').getOne(attachment.selectedBenefitId);
  const submission = await pb.collection('submissions').getOne(selectedBenefit.submissionId);

  if (submission.employeeId !== employee?.id && !isAdmin) {
    throw new Error('Unauthorized: You do not own this attachment');
  }

  res.json({
    id: attachment.id,
    selectedBenefitId: attachment.selectedBenefitId,
    fileName: attachment.fileName,
    fileUrl: pb.getFileUrl(attachment, attachment.file),
    fileType: attachment.fileType,
    uploadedAt: attachment.uploadedAt,
  });
});

export default router;
