const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { 
  generatePresignedUploadUrl, 
  generatePresignedDownloadUrl, 
  deleteFile 
} = require('../services/s3');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

router.post('/upload-url', async (req, res) => {
  try {
    const { fileName, contentType, taskId } = req.body;

    if (!fileName) {
      return res.status(400).json({ error: 'File name is required' });
    }

    const fileKey = `tasks/${taskId || 'general'}/${req.user.userId}/${uuidv4()}-${fileName}`;
    
    const result = await generatePresignedUploadUrl(fileKey, contentType);
    
    if (result.success) {
      res.json({
        uploadUrl: result.uploadUrl,
        fileKey: result.key,
        message: 'Upload URL generated successfully'
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

router.post('/download-url', async (req, res) => {
  try {
    const { fileKey } = req.body;

    if (!fileKey) {
      return res.status(400).json({ error: 'File key is required' });
    }

    // Basic access control - users can only access their own files
    if (!fileKey.includes(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied to this file' });
    }

    const result = await generatePresignedDownloadUrl(fileKey);
    
    if (result.success) {
      res.json({
        downloadUrl: result.downloadUrl,
        message: 'Download URL generated successfully'
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

router.delete('/:fileKey(*)', async (req, res) => {
  try {
    const fileKey = req.params.fileKey;

    if (!fileKey) {
      return res.status(400).json({ error: 'File key is required' });
    }

    // Basic access control - users can only delete their own files
    if (!fileKey.includes(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied to this file' });
    }

    const result = await deleteFile(fileKey);
    
    if (result.success) {
      res.json({ message: 'File deleted successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
