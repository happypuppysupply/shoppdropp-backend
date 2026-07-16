import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

// List available server types
router.get('/server-types', async (req: Request, res: Response) => {
  try {
    const token = process.env.HETZNER_API_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'HETZNER_API_TOKEN not set' });
    }

    const response = await axios.get('https://api.hetzner.cloud/v1/server_types', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Filter for available server types
    const types = response.data.server_types
      .filter((t: any) => !t.deprecated)
      .map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        cores: t.cores,
        memory: t.memory,
        disk: t.disk,
        storage_type: t.storage_type,
        cpu_type: t.cpu_type,
        architecture: t.architecture
      }));

    res.json({ server_types: types });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch server types',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// List locations
router.get('/locations', async (req: Request, res: Response) => {
  try {
    const token = process.env.HETZNER_API_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'HETZNER_API_TOKEN not set' });
    }

    const response = await axios.get('https://api.hetzner.cloud/v1/locations', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({ locations: response.data.locations });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch locations',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

export default router;
