SELECT id, status, ip, created_at 
FROM vps_workers 
WHERE user_id = '4917a55a-59c3-4d41-af49-b95c678b63d1'
ORDER BY created_at DESC 
LIMIT 5;
