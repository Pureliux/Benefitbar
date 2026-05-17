import express from 'express';

const router = express.Router();

router.get('/oauth2-redirect', (req, res) => {
  const target = new URL('/auth/microsoft/callback', `${req.protocol}://${req.get('host')}`);
  for (const [key, value] of Object.entries(req.query)) {
    target.searchParams.set(key, value);
  }
  return res.redirect(target.toString());
});

router.post('/oauth2-redirect', (req, res) => {
  const target = new URL('/auth/microsoft/callback', `${req.protocol}://${req.get('host')}`);
  for (const [key, value] of Object.entries(req.query)) {
    target.searchParams.set(key, value);
  }
  return res.redirect(target.toString());
});

export default router;
