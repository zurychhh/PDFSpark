# Railway CLI Update Guide

## Issue: MCP Server Scopes Renamed

The error you encountered:
```
Existing MCP server scopes have been renamed: "project" is now "local" and "global" is now "user"
```

This error indicates that the Railway CLI commands have changed due to a renaming of server scopes in the Railway platform.

## What Changed?

Railway has renamed their MCP server scopes:
- `project` has been renamed to `local`
- `global` has been renamed to `user`

This means the Railway CLI commands have changed significantly from previous versions.

## Old vs New Command Comparison

| Old Command | New Command | Description |
|-------------|-------------|-------------|
| `railway project list` | `railway list` | List all projects |
| `railway project link` | `railway link` | Link to a project |
| `railway environment` | `railway environment` | Manage environments (still works) |
| `railway status` | `railway status` | Check status (still works) |
| `railway up` | `railway up` | Deploy project (still works) |

## How to Fix This Issue

1. **Update Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

2. **Use the included updated scripts**:
   - `railway-fix-deployment.sh`: Fixes the current deployment
   - `deploy-railway-local.sh`: Use for future deployments
   - `verify-railway-deployment.sh`: Verify deployment status

3. **Run the fix script**:
   ```bash
   ./railway-fix-deployment.sh
   ```

## Manual Fix Steps

If you prefer to fix it manually:

1. Login to Railway:
   ```bash
   railway login
   ```

2. Link to your project:
   ```bash
   railway link
   ```

3. Set critical environment variables:
   ```bash
   railway variables set USE_MEMORY_FALLBACK=true
   railway variables set TEMP_DIR=/app/temp
   railway variables set UPLOAD_DIR=/app/uploads
   railway variables set LOG_DIR=/app/logs
   railway variables set PORT=3000
   railway variables set NODE_ENV=production
   ```

4. Deploy:
   ```bash
   railway up
   ```

5. Check status:
   ```bash
   railway status
   ```

## Future Deployments

When deploying in the future, use the updated commands and scripts. The old scripts that use commands like `railway project list` will not work with newer versions of the Railway CLI.

## Common Issues After Fixing

1. **Not Found Error (Train has not arrived at the station)**:
   This usually means the deployment is still in progress or has failed. Check deployment status with `railway status` and logs with `railway logs`.

2. **Health Check Failures**:
   Make sure the health check endpoint exists and is correctly configured in `railway.json`.

3. **Missing Environment Variables**:
   Verify all environment variables are set with `railway variables`.

## Need More Help?

If you continue to experience issues:
1. Check the Railway documentation for updated commands: https://docs.railway.app/
2. Run `railway help` to see all available commands
3. Check Railway status: https://status.railway.app/