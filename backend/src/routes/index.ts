import express from 'express';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    status: 'API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

export default router;