import { Router } from 'express';
import { supabase } from '../db/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * GET /api/workers/:workerId/tasks
 * Get recent tasks for a worker (for polling status)
 */
router.get('/:workerId/tasks', authenticate, async (req, res) => {
  try {
    const { workerId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify worker belongs to user
    const { data: worker, error: workerError } = await supabase
      .from('workers')
      .select('id')
      .eq('id', workerId)
      .eq('user_id', userId)
      .single();

    if (workerError || !worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    // Get recent commands/tasks for this worker
    const { data: tasks, error: tasksError } = await supabase
      .from('worker_commands')
      .select('*')
      .eq('worker_id', workerId)
      .in('type', ['run_task'])
      .order('created_at', { ascending: false })
      .limit(20);

    if (tasksError) {
      console.error('Failed to fetch tasks:', tasksError);
      return res.status(500).json({ error: 'Failed to fetch tasks' });
    }

    // Get product research results for this store
    const { data: researchResults, error: researchError } = await supabase
      .from('product_research_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (researchError) {
      console.error('Failed to fetch research results:', researchError);
    }

    // Format tasks for frontend
    const formattedTasks = tasks?.map((task: any) => ({
      id: task.id,
      task_type: task.payload?.task,
      status: task.status,
      result: task.result,
      error: task.error,
      created_at: task.created_at,
      started_at: task.started_at,
      completed_at: task.completed_at
    })) || [];

    res.json({ 
      tasks: formattedTasks,
      research_results: researchResults || []
    });
  } catch (err: any) {
    console.error('Error fetching worker tasks:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
