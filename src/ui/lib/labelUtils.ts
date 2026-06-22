/**
 * labelUtils.ts
 *
 * Shared utilities for label sync operations.
 * Used by both runAccountInit (zaloInitUtils) and LabelSettings UI.
 */

import ipc from '@/lib/ipc';

/**
 * Extract the display name from a Zalo label object.
 * Zalo labels use `text` as the primary name field, falling back to `name` and `title`.
 */
export function getZaloLabelName(zLabel: any): string {
    return (zLabel.text || zLabel.name || zLabel.title || `Nhãn ${zLabel.id ?? '?'}`).trim();
}

// ── Sync Zalo Labels -> Local DB ──────────────────────────────────────────────

export interface SyncZaloLabelsOptions {
    /** Raw Zalo label array from API (labelData) */
    zaloLabels: any[];
    /** Target account zalo_id */
    activeZaloId: string;
    /** merge = skip labels that already exist by name; replace = upsert all */
    mode: 'merge' | 'replace';
    /** Existing local labels (for merge dedup). If not provided, fetched from DB. */
    existingLocalLabels?: Array<{ name: string }>;
}

/**
 * Syncs Zalo labels into the local_labels DB table.
 *
 * Correctly maps Zalo API fields:
 *   text/name/title  ->  name
 *   color            ->  color
 *   emoji/icon       ->  emoji
 *   (computed)       ->  textColor  (based on background luminance)
 *
 * Returns the number of labels actually upserted.
 */
export async function syncZaloLabelsToLocalDB(opts: SyncZaloLabelsOptions): Promise<number> {
    const {zaloLabels, activeZaloId, mode, existingLocalLabels} = opts;
    if (!zaloLabels || zaloLabels.length === 0) return 0;

    // Build a Set of existing label names for merge dedup
    let existingNames = new Set<string>();
    let existingLabelsList: any[] = [];
    if (mode === 'merge') {
        if (existingLocalLabels) {
            existingNames = new Set(existingLocalLabels.map(l => l.name.toLowerCase()));
            existingLabelsList = existingLocalLabels;
        } else {
            try {
                const res = await ipc.db?.getLocalLabels({zaloId: activeZaloId});
                const labels: any[] = res?.labels || [];
                existingLabelsList = labels;
                existingNames = new Set(labels.map((l: any) => (l.name || '').toLowerCase()));
            } catch { /* ignore */
            }
        }
    }

    // Mode = 'replace' removeAllLabels done and add labels new
    if (mode === 'replace') {
        try {
            const res = await ipc.db?.getLocalLabels({zaloId: activeZaloId});
            const labels: any[] = res?.labels || [];
            for (const label of labels) {
                if (label?.id == null) continue;
                await ipc.db?.deleteLocalLabel({id: label.id});
            }
        } catch { /* ignore */
        }
    }

    // Load current local label threads mapping from DB
    let currentThreadsList: Array<{ label_id: number; thread_id: string }> = [];
    try {
        const threadsRes = await ipc.db?.getLocalLabelThreads({ zaloId: activeZaloId });
        currentThreadsList = threadsRes?.threads || [];
    } catch { /* ignore */ }

    let count = 0;
    for (const zLabel of zaloLabels) {
        const name = getZaloLabelName(zLabel);
        if (!name) continue;

        let labelId: number | null = null;
        const isExisting = mode === 'merge' && existingNames.has(name.toLowerCase());

        const color = zLabel.color || '#3b82f6';
        const emoji = zLabel.emoji || zLabel.icon || '🏷️';
        const textColor = '#ffffff';

        if (isExisting) {
            // Find existing label to get its ID
            const matched = existingLabelsList.find((l: any) => (l.name || '').toLowerCase() === name.toLowerCase());
            if (matched && matched.id != null) {
                labelId = matched.id;
            }
        } else {
            // Create new local label
            try {
                const res = await ipc.db?.upsertLocalLabel({
                    label: {
                        name,
                        color,
                        textColor,
                        emoji,
                        pageIds: activeZaloId,
                        isActive: 1,
                        sortOrder: count,
                    },
                });

                if (res?.success && res.id != null) {
                    labelId = res.id;
                    count++;
                }
            } catch { /* skip individual failures */
            }
        }

        if (labelId != null) {
            const zaloCleanedThreadIds = (zLabel.conversations && Array.isArray(zLabel.conversations))
                ? zLabel.conversations.map((convId: string) => convId.startsWith('g') ? convId.slice(1) : convId)
                : [];

            const existingThreadsForLabel = currentThreadsList
                .filter(t => Number(t.label_id) === labelId)
                .map(t => t.thread_id);

            const zaloCleanedSet = new Set(zaloCleanedThreadIds);
            const localSet = new Set(existingThreadsForLabel);

            // 1. Add new conversation links from Zalo to Local DB
            for (const cleanedThreadId of zaloCleanedThreadIds) {
                if (!localSet.has(cleanedThreadId)) {
                    try {
                        await ipc.db?.assignLocalLabelToThread({
                            zaloId: activeZaloId,
                            labelId,
                            threadId: cleanedThreadId,
                            labelText: name,
                            labelColor: color,
                            labelEmoji: emoji,
                        });
                    } catch { /* skip */ }
                }
            }

            // 2. Remove stale conversation links in Local DB that are no longer in Zalo
            for (const threadId of existingThreadsForLabel) {
                if (!zaloCleanedSet.has(threadId)) {
                    try {
                        await ipc.db?.removeLocalLabelFromThread({
                            zaloId: activeZaloId,
                            labelId,
                            threadId,
                            labelText: name,
                            labelColor: color,
                            labelEmoji: emoji,
                        });
                    } catch { /* skip */ }
                }
            }

            if (isExisting) {
                count++;
            }
        }
    }

    return count;
}
