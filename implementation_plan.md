# Plan: Implement Zagi App Fixes & Enhancements

Detailed technical design and execution plan to address all 12 reported issues and user requests.

---

## Proposed Changes

### TopBar & Layout

#### [MODIFY] [TopBar.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/layout/TopBar.tsx)
- **Lock Screen Button**: Always show the lock screen icon. When clicked:
  - If lock screen is set up (`lockScreenEnabled === true`), dispatch `lockScreen:lock` event.
  - If not set up, show a notification guiding the user to Settings and redirect them to the settings view.
- **Shortcuts Button**: Add a new `?` button next to the theme toggle. Clicking this button opens a modal showing a guide for all available keyboard shortcuts.
- **Shortcuts Modal**: Create a clean, elegant modal within the component (or imported) listing:
  - `Ctrl + Shift + L`: Khóa màn hình (Lock screen)
  - `Ctrl + Shift + N`: Mở chat nhanh (Open Quick Chat)
  - `Ctrl + Tab`: Chuyển đổi tài khoản (Switch account)

#### [MODIFY] [App.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/App.tsx)
- Update `keydown` and lock event listeners to dynamically check lock screen status rather than relying on a static `lockEnabled` state on mount. This ensures the shortcuts work instantly once set up without requiring an app reload.

---

### CRM & Campaigns

#### [MODIFY] [CRMPage.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/crm/CRMPage.tsx)
- **Campaign Wizard Flow**: When clicking "Thêm vào chiến dịch" but no campaign exists, open the campaign creation modal overlaying the selector directly (by setting `showCreateInAddModal` to `true`). Once created, automatically select the new campaign.
- **Duplicate Prevention**: Use a ref flag (`creatingCampaignRef`) in `handleCreateCampaign` and `handleCreateCampaignInAddModal` to prevent duplicate submissions if double-clicked.

#### [MODIFY] [CampaignCreateModal.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/crm/campaigns/CampaignCreateModal.tsx)
- **Submit Safeguard**: Check the `saving` state early in `handleSave` to reject consecutive duplicate clicks.

#### [MODIFY] [TargetSelector.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/crm/campaigns/TargetSelector.tsx)
- **Group Member Expansion**: When confirming selection, check if any chosen contact is of type `group`. If so, fetch all members of that group from DB (`ipc.db.getGroupMembers`) and add them as individuals, ensuring duplicate IDs are skipped and we do not exceed limit.

#### [MODIFY] [BulkGroupManageModal.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/crm/modals/BulkGroupManageModal.tsx)
- **Avatar Preservation**: When loading initial contacts, if a contact ID is not in the friends cache, query `page_group_member` rows to retrieve its cached avatar and display name before generating a dummy contact. This ensures avatar data is never lost.

#### [MODIFY] [DatabaseService.ts](file:///Users/kimtrungduong/Downloads/deplao/src/services/database/DatabaseService.ts)
- **upsertGroupMember Query**: Refactor `upsertGroupMember` using `ON CONFLICT DO UPDATE` so that it preserves existing display name and avatar columns if the new inputs are empty.

---

### Chat & Labels

#### [MODIFY] [ChatHeader.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/chat/ChatHeader.tsx)
- **Zalo Group Protection**: Hide the Label Picker and Zalo labels entirely when the current active thread is a group (`activeThreadType === 1` / thread prefix `g`).
- **Pill Delete Buttons**: Render a small deletion `x` button inside both Zalo and Local label pills. Clicking `x` unassigns the label instantly without opening the dropdown picker.

#### [MODIFY] [LabelPicker.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/chat/LabelPicker.tsx)
- Add support for an `onRemoveLabel` callback in `ActiveLabels` component to allow quick-deleting labels.

#### [MODIFY] [MessageInput.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/chat/MessageInput.tsx)
- **Quick Local Label Creator**: Add a inline `+ Tạo nhãn` button at the end of the local labels row. Clicking this opens a small form to input a name, choose a randomized clean color, and instantly create the label using `ipc.db.upsertLocalLabel`.

---

### Workflow & UI Styling

#### [MODIFY] [WorkflowEngineService.ts](file:///Users/kimtrungduong/Downloads/deplao/src/services/workflow/WorkflowEngineService.ts)
- **Execution Fallback**: In `getApi()`, fallback to `triggerData?.zaloId` if the workspace page ID is not connected, solving the manual run connection issue.

#### [MODIFY] [WorkflowNodes.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/workflow/nodes/WorkflowNodes.tsx)
- **Light Mode Styles**: Standardize nodes to use theme-based colors instead of hardcoded dark backgrounds.

#### [MODIFY] [WorkflowEditor.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/workflow/WorkflowEditor.tsx)
- **Standard Button Design**: Normalize button designs to use premium blue backgrounds with white text and icons (`bg-blue-600 hover:bg-blue-700 text-white`).

#### [MODIFY] [NodeConfigPanel.tsx](file:///Users/kimtrungduong/Downloads/deplao/src/ui/components/workflow/NodeConfigPanel.tsx)
- **Copy Error Details**: Add a "Copy lỗi" button next to workflow execution error panels to easily copy errors to clipboard.

---

## Verification Plan

### Automated
- Compile and build project: `npm run build` to verify no TypeScript compilation errors.

### Manual
- Toggle dark/light theme to verify workflow node background adjustments.
- Open Chat view, verify that group threads do not show label configuration and that single chats allow quick-removing Zalo and Local labels.
- Verify lock screen icon displays always and redirects to Settings if not enabled.
- Verify shortcuts modal opens via `?` button.
- Verify quick-creation of local labels in MessageInput works and updates instantly.
- Verify group expansion when adding targets to campaigns in CRM.
