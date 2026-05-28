/**
 * DatabaseBackupService.ts
 * Auto cloud backup service for Zagi databases (zagi-tool.db and sharded DBs) to Google Drive.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as zlib from 'zlib';
import { google } from 'googleapis';
import DatabaseService from './DatabaseService';
import Logger from '../../utils/Logger';
import { secureGet } from '../secure/SecureSettingsService';

export class DatabaseBackupService {
    private static instance: DatabaseBackupService;
    private intervalId: NodeJS.Timeout | null = null;
    private isRunningBackup = false;

    public static getInstance(): DatabaseBackupService {
        if (!DatabaseBackupService.instance) {
            DatabaseBackupService.instance = new DatabaseBackupService();
        }
        return DatabaseBackupService.instance;
    }

    /**
     * Start the periodic backup scheduler.
     * Reads configuration from database.
     */
    public startScheduler(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        // Run scheduler check every hour
        this.intervalId = setInterval(() => {
            this.checkAndRunBackup();
        }, 60 * 60 * 1000); // 1 hour

        // Run initial check shortly after startup
        setTimeout(() => this.checkAndRunBackup(), 5000);
        Logger.log('[DatabaseBackupService] Scheduler started.');
    }

    public stopScheduler(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        Logger.log('[DatabaseBackupService] Scheduler stopped.');
    }

    private async checkAndRunBackup(): Promise<void> {
        if (this.isRunningBackup) return;

        const dbService = DatabaseService.getInstance();
        const enabledSetting = dbService.getSetting('backup_enabled');
        if (enabledSetting !== 'true') {
            return;
        }

        const intervalHoursStr = dbService.getSetting('backup_interval_hours') || '24';
        const intervalHours = parseInt(intervalHoursStr, 10) || 24;
        
        const lastBackupStr = dbService.getSetting('backup_last_time') || '0';
        const lastBackupTime = parseInt(lastBackupStr, 10) || 0;
        const now = Date.now();

        if (now - lastBackupTime >= intervalHours * 60 * 60 * 1000) {
            this.isRunningBackup = true;
            try {
                await this.runBackupWithRetry();
            } finally {
                this.isRunningBackup = false;
            }
        }
    }

    public async runBackupWithRetry(): Promise<void> {
        let attempts = 0;
        const maxAttempts = 3;
        const retryDelayMs = 5 * 60 * 1000; // 5 minutes

        while (attempts < maxAttempts) {
            attempts++;
            Logger.log(`[DatabaseBackupService] Starting backup attempt ${attempts}/${maxAttempts}...`);
            try {
                await this.executeBackup();
                
                // On success, update last backup settings
                const dbService = DatabaseService.getInstance();
                dbService.setSetting('backup_last_time', Date.now().toString());
                dbService.setSetting('backup_last_status', 'success');
                dbService.setSetting('backup_last_error', '');
                Logger.log(`[DatabaseBackupService] Backup completed successfully.`);
                return;
            } catch (err: any) {
                Logger.error(`[DatabaseBackupService] Backup attempt ${attempts} failed: ${err.message}`);
                if (attempts < maxAttempts) {
                    Logger.log(`[DatabaseBackupService] Retrying in 5 minutes...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                } else {
                    // Log failure state to database setting so UI can warn user
                    const dbService = DatabaseService.getInstance();
                    dbService.setSetting('backup_last_status', 'failed');
                    dbService.setSetting('backup_last_error', err.message || 'Unknown error');
                }
            }
        }
    }

    private async executeBackup(): Promise<void> {
        const dbService = DatabaseService.getInstance();
        
        // Retrieve credentials securely
        const credsStr = secureGet('google_drive_credentials');
        if (!credsStr) {
            throw new Error('Google Drive credentials not found or unconfigured');
        }

        let creds: any;
        try {
            creds = JSON.parse(credsStr);
        } catch {
            throw new Error('Invalid Google Drive credentials format (must be JSON)');
        }

        const { client_id, client_secret, refresh_token, folder_id } = creds;
        if (!client_id || !client_secret || !refresh_token) {
            throw new Error('Missing client_id, client_secret, or refresh_token in credentials');
        }

        // 1. Flush/Checkpoint databases to flush WAL pages
        dbService.forceFlush();

        const dbPath = dbService.getDbPath();
        const dbDir = path.dirname(dbPath);
        const tempDir = path.join(dbDir, 'temp_backup');
        
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const openShards = dbService.getOpenShardedConnections();
        const files = fs.readdirSync(dbDir);
        const dbFiles = files.filter(f => f.startsWith('zagi-') && f.endsWith('.db'));

        const backupPaths: string[] = [];

        try {
            // 2. Safely perform hot backup of each database file
            for (const filename of dbFiles) {
                const srcPath = path.join(dbDir, filename);
                const destPath = path.join(tempDir, filename);

                let isShardedOpen = false;
                let shardedConn: any = null;
                
                if (filename === 'zagi-tool.db') {
                    shardedConn = dbService.getDbConnection();
                    isShardedOpen = true;
                } else {
                    const match = filename.match(/zagi-(.+)\.db/);
                    if (match && match[1]) {
                        const zaloId = match[1];
                        if (openShards.has(zaloId)) {
                            shardedConn = openShards.get(zaloId);
                            isShardedOpen = true;
                        }
                    }
                }

                if (isShardedOpen && shardedConn && typeof shardedConn.backup === 'function') {
                    Logger.log(`[DatabaseBackupService] Creating SQLite hot backup for ${filename}...`);
                    await shardedConn.backup(destPath);
                } else {
                    Logger.log(`[DatabaseBackupService] Copying closed SQLite file ${filename}...`);
                    fs.copyFileSync(srcPath, destPath);
                }

                // 3. Compress database using gzip
                const compressedPath = `${destPath}.gz`;
                await this.compressFile(destPath, compressedPath);
                backupPaths.push(compressedPath);
                
                // Delete uncompressed hot backup
                try { fs.unlinkSync(destPath); } catch {}
            }

            // 4. Connect to Google Drive via OAuth2
            const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
            oauth2Client.setCredentials({ refresh_token });
            const drive = google.drive({ version: 'v3', auth: oauth2Client });

            // 5. Upload files to Drive
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            for (const gzippedPath of backupPaths) {
                const filename = path.basename(gzippedPath);
                const uploadName = `${timestamp}_${filename}`;

                Logger.log(`[DatabaseBackupService] Uploading ${filename} to Google Drive as "${uploadName}"...`);
                await drive.files.create({
                    requestBody: {
                        name: uploadName,
                        parents: folder_id ? [folder_id] : undefined
                    },
                    media: {
                        mimeType: 'application/gzip',
                        body: fs.createReadStream(gzippedPath)
                    }
                });
            }
        } finally {
            // Clean up temporary files
            try {
                if (fs.existsSync(tempDir)) {
                    const tempFiles = fs.readdirSync(tempDir);
                    for (const f of tempFiles) {
                        try { fs.unlinkSync(path.join(tempDir, f)); } catch {}
                    }
                    fs.rmdirSync(tempDir);
                }
            } catch (err: any) {
                Logger.warn(`[DatabaseBackupService] Error during temp backup cleanup: ${err.message}`);
            }
        }
    }

    private compressFile(src: string, dest: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const raw = fs.createReadStream(src);
            const zip = zlib.createGzip();
            const out = fs.createWriteStream(dest);

            raw.pipe(zip).pipe(out);

            out.on('finish', () => resolve());
            out.on('error', err => reject(err));
            zip.on('error', err => reject(err));
            raw.on('error', err => reject(err));
        });
    }
}
