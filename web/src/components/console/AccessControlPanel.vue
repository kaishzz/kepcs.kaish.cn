<script setup lang="ts">
import {
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSpace,
  NSpin,
  NTag,
} from 'naive-ui'
import { computed, ref, watch } from 'vue'

import { http } from '../../lib/api'
import { CONSOLE_API_BASE } from '../../lib/console'
import { pushToast } from '../../lib/toast'
import ConsoleMetricStrip from './ConsoleMetricStrip.vue'
import ConsolePanelCard from './ConsolePanelCard.vue'
import ConsoleSectionBlock from './ConsoleSectionBlock.vue'
import type {
  AccessGroupItem,
  AccessPermissionCatalogItem,
  DirectAccessUserItem,
} from '../../types'

const props = defineProps<{
  active: boolean
}>()

type PermissionSection = {
  name: string
  items: AccessPermissionCatalogItem[]
}

const loading = ref(false)
const saving = ref(false)
const groups = ref<AccessGroupItem[]>([])
const directUsers = ref<DirectAccessUserItem[]>([])
const catalog = ref<AccessPermissionCatalogItem[]>([])

const confirmState = ref({
  show: false,
  title: '',
  lines: [] as string[],
  positiveText: '确认',
  loading: false,
})

const groupModal = ref({
  show: false,
  id: '',
  code: '',
  name: '',
  note: '',
  permissions: [] as string[],
  members: [{ steamId: '', note: '' }],
})

const directUserModal = ref({
  show: false,
  steamId: '',
  note: '',
  permissions: [] as string[],
})

const editableCatalog = computed(() =>
  catalog.value.filter((item) => item.editable !== false && item.key !== 'console.my_cdks'),
)

const permissionSections = computed<PermissionSection[]>(() => {
  const sectionMap = new Map<string, AccessPermissionCatalogItem[]>()

  editableCatalog.value.forEach((item) => {
    const bucket = sectionMap.get(item.section) || []
    bucket.push(item)
    sectionMap.set(item.section, bucket)
  })

  return Array.from(sectionMap.entries()).map(([name, items]) => ({
    name,
    items,
  }))
})

const overviewStats = computed(() => [
  { label: '权限组', value: groups.value.length },
  { label: 'SteamID 直授', value: directUsers.value.length },
  {
    label: '已开放权限点',
    value: editableCatalog.value.length,
  },
])

const totalMembers = computed(() =>
  groups.value.reduce((sum, group) => sum + group.members.length, 0),
)

let pendingConfirmAction: (() => Promise<void>) | null = null

function resetGroupModal() {
  groupModal.value = {
    show: false,
    id: '',
    code: '',
    name: '',
    note: '',
    permissions: [],
    members: [{ steamId: '', note: '' }],
  }
}

function resetDirectUserModal() {
  directUserModal.value = {
    show: false,
    steamId: '',
    note: '',
    permissions: [],
  }
}

async function loadAccess() {
  loading.value = true

  try {
    const { data } = await http.get(`${CONSOLE_API_BASE}/access`)
    groups.value = data.groups || []
    directUsers.value = data.directUsers || []
    catalog.value = data.catalog || []
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

function openConfirmDialog(title: string, lines: string[], positiveText: string, action: () => Promise<void>) {
  pendingConfirmAction = action
  confirmState.value = {
    show: true,
    title,
    lines,
    positiveText,
    loading: false,
  }
}

async function runConfirmAction() {
  if (!pendingConfirmAction || confirmState.value.loading) {
    return
  }

  confirmState.value.loading = true

  try {
    await pendingConfirmAction()
    confirmState.value.show = false
    pendingConfirmAction = null
  } catch {
    // keep modal open for toast feedback
  } finally {
    confirmState.value.loading = false
  }
}

function closeConfirmDialog() {
  confirmState.value.show = false
  confirmState.value.loading = false
  pendingConfirmAction = null
}

function openCreateGroup() {
  resetGroupModal()
  groupModal.value.show = true
}

function openEditGroup(group: AccessGroupItem) {
  groupModal.value = {
    show: true,
    id: group.id,
    code: group.code,
    name: group.name,
    note: group.note || '',
    permissions: [...group.permissions],
    members: group.members.length
      ? group.members.map((member) => ({
        steamId: member.steamId,
        note: member.note || '',
      }))
      : [{ steamId: '', note: '' }],
  }
}

function addGroupMemberRow() {
  groupModal.value.members.push({ steamId: '', note: '' })
}

function removeGroupMemberRow(index: number) {
  if (groupModal.value.members.length === 1) {
    groupModal.value.members[0] = { steamId: '', note: '' }
    return
  }

  groupModal.value.members.splice(index, 1)
}

async function saveGroup() {
  saving.value = true

  try {
    const members = groupModal.value.members
      .map((item) => ({
        steamId: item.steamId.trim(),
        note: item.note.trim(),
      }))
      .filter((item) => item.steamId)

    if (groupModal.value.id) {
      await http.patch(`${CONSOLE_API_BASE}/access/groups/${encodeURIComponent(groupModal.value.id)}`, {
        name: groupModal.value.name.trim(),
        note: groupModal.value.note.trim() || undefined,
      })
      await http.put(`${CONSOLE_API_BASE}/access/groups/${encodeURIComponent(groupModal.value.id)}/permissions`, {
        permissions: groupModal.value.permissions,
      })
      await http.put(`${CONSOLE_API_BASE}/access/groups/${encodeURIComponent(groupModal.value.id)}/members`, {
        members,
      })
      pushToast('权限组已更新', 'success')
    } else {
      const { data } = await http.post(`${CONSOLE_API_BASE}/access/groups`, {
        code: groupModal.value.code.trim(),
        name: groupModal.value.name.trim(),
        note: groupModal.value.note.trim() || undefined,
      })
      const groupId = data.group?.id

      if (groupId) {
        await http.put(`${CONSOLE_API_BASE}/access/groups/${encodeURIComponent(groupId)}/permissions`, {
          permissions: groupModal.value.permissions,
        })
        await http.put(`${CONSOLE_API_BASE}/access/groups/${encodeURIComponent(groupId)}/members`, {
          members,
        })
      }

      pushToast('权限组已创建', 'success')
    }

    groupModal.value.show = false
    await loadAccess()
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

function confirmDeleteGroup(group: AccessGroupItem) {
  openConfirmDialog(
    '确认删除权限组',
    ['删除后组内成员将失去该组授予的权限', `确认删除 ${group.name} (${group.code})`],
    '确认删除',
    async () => {
      await http.delete(`${CONSOLE_API_BASE}/access/groups/${encodeURIComponent(group.id)}`)
      pushToast('权限组已删除', 'success')
      await loadAccess()
    },
  )
}

function openCreateDirectUser() {
  resetDirectUserModal()
  directUserModal.value.show = true
}

function openEditDirectUser(user: DirectAccessUserItem) {
  directUserModal.value = {
    show: true,
    steamId: user.steamId,
    note: user.note || '',
    permissions: [...user.permissions],
  }
}

async function saveDirectUser() {
  saving.value = true

  try {
    const payload = {
      steamId: directUserModal.value.steamId.trim(),
      note: directUserModal.value.note.trim() || undefined,
      permissions: directUserModal.value.permissions,
    }

    if (directUsers.value.some((item) => item.steamId === payload.steamId)) {
      await http.patch(`${CONSOLE_API_BASE}/access/users/${encodeURIComponent(payload.steamId)}`, {
        note: payload.note,
        permissions: payload.permissions,
      })
      pushToast('SteamID 直授权限已更新', 'success')
    } else {
      await http.post(`${CONSOLE_API_BASE}/access/users`, payload)
      pushToast('SteamID 直授权限已创建', 'success')
    }

    directUserModal.value.show = false
    await loadAccess()
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

function confirmDeleteDirectUser(user: DirectAccessUserItem) {
  openConfirmDialog(
    '确认删除直授权限',
    ['删除后将移除该 SteamID 的单独授予权限', `确认删除 ${user.steamId}`],
    '确认删除',
    async () => {
      await http.delete(`${CONSOLE_API_BASE}/access/users/${encodeURIComponent(user.steamId)}`)
      pushToast('SteamID 直授权限已删除', 'success')
      await loadAccess()
    },
  )
}

watch(
  () => props.active,
  (active) => {
    if (active) {
      void loadAccess()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="console-wrap access-console-wrap">
    <ConsolePanelCard
      title="权限分配"
      description="按权限组或 SteamID 直授管理后台页面与子分组访问范围，统计条带和内容面板统一复用后台骨架。"
      class="access-hero-card"
    >
      <template #header-extra>
        <div class="access-panel-banner__meta">
        <NTag round>成员 {{ totalMembers }}</NTag>
        <NTag round type="info">权限目录 {{ editableCatalog.length }}</NTag>
        </div>
      </template>

      <ConsoleMetricStrip :items="overviewStats" />
    </ConsolePanelCard>

    <div v-if="loading" class="hero-note min-h-[260px]">
      <NSpin size="large" />
    </div>

    <template v-else>
      <div class="access-main-grid">
        <ConsolePanelCard
          title="权限组"
          description="适合给同一批成员分配整组后台权限和子菜单访问范围。"
          class="access-card-shell"
        >
          <template #header-extra>
            <div class="access-card-banner__actions">
              <NTag round>{{ groups.length }} 组</NTag>
              <NButton type="primary" @click="openCreateGroup">新增权限组</NButton>
            </div>
          </template>

          <ConsoleSectionBlock class="access-card-section">
            <div v-if="groups.length" class="access-card-list">
              <article v-for="group in groups" :key="group.id" class="access-entry-card">
                <div class="access-entry-card__top">
                  <div class="access-entry-card__title">
                    <strong>{{ group.name }}</strong>
                    <span>{{ group.code }}</span>
                  </div>
                  <NTag :type="group.isSystem ? 'warning' : 'default'" round>
                    {{ group.isSystem ? '系统组' : '自定义组' }}
                  </NTag>
                </div>

                <div class="access-entry-card__meta">
                  <div>
                    <span>权限数量</span>
                    <strong>{{ group.permissions.length }}</strong>
                  </div>
                  <div>
                    <span>成员数量</span>
                    <strong>{{ group.members.length }}</strong>
                  </div>
                </div>

                <div v-if="group.note" class="access-entry-card__note">{{ group.note }}</div>

                <div class="access-chip-list">
                  <span v-for="code in group.permissions.slice(0, 4)" :key="`${group.id}-${code}`" class="access-chip">
                    {{ code }}
                  </span>
                  <span v-if="group.permissions.length > 4" class="access-chip">
                    +{{ group.permissions.length - 4 }}
                  </span>
                </div>

                <div class="access-entry-card__actions">
                  <NButton type="warning" @click="openEditGroup(group)">编辑</NButton>
                  <NButton v-if="!group.isSystem" type="error" ghost @click="confirmDeleteGroup(group)">删除</NButton>
                </div>
              </article>
            </div>

            <div v-else class="hero-note min-h-[220px] access-empty-state">
              <div class="hero-note__inner">
                <div class="hero-note__title">暂无权限组</div>
                <div class="hero-note__desc">可以先创建一个权限组, 再给成员勾选对应页面权限</div>
              </div>
            </div>
          </ConsoleSectionBlock>
        </ConsolePanelCard>

        <ConsolePanelCard
          title="SteamID 直授"
          description="适合给单个 SteamID 单独开放页面或临时附加某几个操作权限。"
          class="access-card-shell"
        >
          <template #header-extra>
            <div class="access-card-banner__actions">
              <NTag round>{{ directUsers.length }} 人</NTag>
              <NButton type="primary" @click="openCreateDirectUser">新增直授</NButton>
            </div>
          </template>

          <ConsoleSectionBlock class="access-card-section">
            <div v-if="directUsers.length" class="access-card-list">
              <article v-for="user in directUsers" :key="user.steamId" class="access-entry-card">
                <div class="access-entry-card__top">
                  <div class="access-entry-card__title">
                    <strong>{{ user.steamId }}</strong>
                    <span>{{ user.note || '无备注' }}</span>
                  </div>
                  <NTag type="info" round>SteamID</NTag>
                </div>

                <div class="access-entry-card__meta">
                  <div>
                    <span>权限数量</span>
                    <strong>{{ user.permissions.length }}</strong>
                  </div>
                  <div>
                    <span>更新时间</span>
                    <strong>{{ user.updatedAt.slice(0, 10) }}</strong>
                  </div>
                </div>

                <div class="access-chip-list">
                  <span v-for="code in user.permissions.slice(0, 4)" :key="`${user.steamId}-${code}`" class="access-chip">
                    {{ code }}
                  </span>
                  <span v-if="user.permissions.length > 4" class="access-chip">
                    +{{ user.permissions.length - 4 }}
                  </span>
                </div>

                <div class="access-entry-card__actions">
                  <NButton type="warning" @click="openEditDirectUser(user)">编辑</NButton>
                  <NButton type="error" ghost @click="confirmDeleteDirectUser(user)">删除</NButton>
                </div>
              </article>
            </div>

            <div v-else class="hero-note min-h-[220px] access-empty-state">
              <div class="hero-note__inner">
                <div class="hero-note__title">暂无直授权限</div>
                <div class="hero-note__desc">适合给单个 SteamID 单独开放某几个页面或子分组</div>
              </div>
            </div>
          </ConsoleSectionBlock>
        </ConsolePanelCard>
      </div>

    </template>

    <NModal v-model:show="groupModal.show" preset="card" :title="groupModal.id ? '编辑权限组' : '新增权限组'" class="max-w-[960px]">
      <div class="access-modal-stack">
        <section class="console-subsection access-modal-section">
          <div class="console-card-head">
            <div class="console-card-head__title">基础信息</div>
            <div class="console-card-head__desc">填写权限组编码、名称和备注</div>
          </div>
          <NForm label-placement="top" class="console-field-grid cols-2">
            <NFormItem label="组编码">
              <NInput v-model:value="groupModal.code" :readonly="Boolean(groupModal.id)" />
            </NFormItem>
            <NFormItem label="组名称">
              <NInput v-model:value="groupModal.name" />
            </NFormItem>
            <NFormItem label="备注" class="col-span-full">
              <NInput v-model:value="groupModal.note" />
            </NFormItem>
          </NForm>
        </section>

        <section class="console-subsection access-modal-section">
          <div class="access-modal-section__header">
            <div class="console-card-head">
              <div class="console-card-head__title">成员列表</div>
              <div class="console-card-head__desc">可直接把多个 SteamID 加入同一权限组</div>
            </div>
            <div class="access-modal-section__actions">
              <NTag round>成员 {{ groupModal.members.filter((item) => item.steamId.trim()).length }}</NTag>
              <NButton type="primary" @click="addGroupMemberRow">新增成员</NButton>
            </div>
          </div>

          <div class="member-editor-list">
            <div v-for="(member, index) in groupModal.members" :key="`member-${index}`" class="member-editor-row">
              <NInput v-model:value="member.steamId" placeholder="SteamID64" />
              <NInput v-model:value="member.note" placeholder="备注" />
              <NButton type="error" ghost @click="removeGroupMemberRow(index)">移除</NButton>
            </div>
          </div>
        </section>

        <section class="console-subsection access-modal-section">
          <div class="access-modal-section__header">
            <div class="console-card-head">
              <div class="console-card-head__title">权限勾选</div>
              <div class="console-card-head__desc">按功能分区选择该权限组可访问的页面和子菜单</div>
            </div>
            <NTag round>已选 {{ groupModal.permissions.length }}</NTag>
          </div>

          <NCheckboxGroup v-model:value="groupModal.permissions">
            <div class="permission-section-grid">
              <section v-for="section in permissionSections" :key="section.name" class="permission-section-card">
                <div class="permission-section-card__head">
                  <div class="permission-section-card__title">{{ section.name }}</div>
                  <NTag size="small" round>{{ section.items.length }}</NTag>
                </div>
                <div class="permission-checkbox-grid">
                  <div v-for="item in section.items" :key="item.key" class="permission-checkbox-item">
                    <NCheckbox :value="item.key">
                      {{ item.label }}
                    </NCheckbox>
                  </div>
                </div>
              </section>
            </div>
          </NCheckboxGroup>
        </section>

        <NSpace justify="end">
          <NButton @click="groupModal.show = false">取消</NButton>
          <NButton type="primary" :loading="saving" @click="saveGroup">保存</NButton>
        </NSpace>
      </div>
    </NModal>

    <NModal v-model:show="directUserModal.show" preset="card" title="SteamID 直授权限" class="max-w-[840px]">
      <div class="access-modal-stack">
        <section class="console-subsection access-modal-section">
          <div class="console-card-head">
            <div class="console-card-head__title">直授信息</div>
            <div class="console-card-head__desc">为单个 SteamID 直接分配页面与子菜单权限</div>
          </div>
          <NForm label-placement="top" class="console-field-grid cols-2">
            <NFormItem label="SteamID64">
              <NInput v-model:value="directUserModal.steamId" />
            </NFormItem>
            <NFormItem label="备注">
              <NInput v-model:value="directUserModal.note" />
            </NFormItem>
          </NForm>
        </section>

        <section class="console-subsection access-modal-section">
          <div class="access-modal-section__header">
            <div class="console-card-head">
              <div class="console-card-head__title">权限勾选</div>
              <div class="console-card-head__desc">只给当前 SteamID 追加需要的权限点</div>
            </div>
            <NTag round>已选 {{ directUserModal.permissions.length }}</NTag>
          </div>

          <NCheckboxGroup v-model:value="directUserModal.permissions">
            <div class="permission-section-grid">
              <section v-for="section in permissionSections" :key="section.name" class="permission-section-card">
                <div class="permission-section-card__head">
                  <div class="permission-section-card__title">{{ section.name }}</div>
                  <NTag size="small" round>{{ section.items.length }}</NTag>
                </div>
                <div class="permission-checkbox-grid">
                  <div v-for="item in section.items" :key="item.key" class="permission-checkbox-item">
                    <NCheckbox :value="item.key">
                      {{ item.label }}
                    </NCheckbox>
                  </div>
                </div>
              </section>
            </div>
          </NCheckboxGroup>
        </section>

        <NSpace justify="end">
          <NButton @click="directUserModal.show = false">取消</NButton>
          <NButton type="primary" :loading="saving" @click="saveDirectUser">保存</NButton>
        </NSpace>
      </div>
    </NModal>

    <NModal v-model:show="confirmState.show" preset="card" :title="confirmState.title" class="max-w-[520px]">
      <div class="access-modal-stack">
        <div class="console-subsection access-modal-section">
          <div class="confirm-dialog-copy">
            <div v-for="line in confirmState.lines" :key="line" class="confirm-dialog-copy__line">
              {{ line }}
            </div>
          </div>
        </div>
        <NSpace justify="end">
          <NButton :disabled="confirmState.loading" @click="closeConfirmDialog">取消</NButton>
          <NButton type="primary" :loading="confirmState.loading" @click="runConfirmAction">
            {{ confirmState.positiveText }}
          </NButton>
        </NSpace>
      </div>
    </NModal>
  </div>
</template>

<style scoped>
.console-wrap,
.access-console-wrap,
.access-main-grid,
.access-card-list,
.access-entry-card,
.access-entry-card__title,
.access-modal-stack,
.permission-section-grid,
.permission-section-card,
.permission-section-card__head,
.permission-checkbox-grid,
.member-editor-list,
.confirm-dialog-copy {
  display: grid;
  gap: 10px;
}

.access-panel-banner,
.access-card-banner,
.access-modal-section__header,
.access-card-banner__actions,
.access-panel-banner__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.access-panel-banner__meta,
.access-card-banner__actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.access-modal-section__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.access-overview-grid {
  display: grid;
  gap: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--app-border-soft);
  border-radius: var(--app-radius-md);
  background: rgba(255, 255, 255, 0.012);
  overflow: hidden;
}

.access-overview-card {
  display: grid;
  align-content: center;
  justify-items: center;
  min-height: 78px;
  padding: 12px 10px;
  text-align: center;
  min-width: 0;
}

.access-overview-card + .access-overview-card {
  border-left: 1px solid var(--app-border-soft);
}

.access-overview-card__label,
.access-entry-card__title span,
.access-entry-card__meta span,
.confirm-dialog-copy__line {
  color: var(--app-text-muted);
  font-size: 13px;
  line-height: 1.7;
}

.access-overview-card__value {
  margin-top: 8px;
  font-size: 24px;
  font-weight: 800;
  color: var(--app-text);
  line-height: 1;
}

.access-card-shell {
  gap: 0;
}

.access-card-banner {
  padding: 0 0 2px;
  border: 0;
  background: transparent;
}

.access-card-section {
  gap: 10px;
  min-height: 280px;
  align-content: start;
}

.access-entry-card__top,
.access-entry-card__actions,
.member-editor-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.access-entry-card__title strong,
.permission-section-card__title,
.console-card-head__title {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 700;
}

.access-entry-card,
.permission-section-card {
  padding: 14px 0 0;
  border: 0;
  border-top: 1px solid var(--app-border-soft);
  border-radius: 0;
  background: transparent;
}

.access-entry-card__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.access-entry-card__meta strong {
  display: block;
  margin-top: 4px;
  color: var(--app-text);
  line-height: 1.6;
  font-size: 15px;
}

.access-entry-card__note {
  color: var(--app-text-soft);
  font-size: 12px;
  line-height: 1.7;
}

.access-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.access-card-list {
  gap: 0;
}

.access-card-list > *:first-child {
  padding-top: 0;
  border-top: 0;
}

.access-chip {
  padding: 4px 8px;
  border-radius: var(--app-radius-sm);
  background: var(--app-panel-bg-strong);
  color: var(--app-text-soft);
  font-size: 11px;
}

.permission-section-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}

.permission-section-card__head {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.permission-checkbox-grid {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 6px 12px;
}

.permission-checkbox-item {
  min-width: 0;
  padding: 8px 0;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0;
  background: transparent;
}

.permission-checkbox-item :deep(.n-checkbox) {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
}

.permission-checkbox-item :deep(.n-checkbox-box-wrapper) {
  flex: 0 0 auto;
  padding-right: 8px;
}

.permission-checkbox-item :deep(.n-checkbox__label) {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  color: var(--app-text-soft);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.access-modal-stack {
  gap: 10px;
  max-height: min(78vh, 760px);
  overflow-y: auto;
  padding-right: 2px;
}

.access-modal-section {
  padding: 0;
  border: 0;
  background: transparent;
}

.access-modal-section .console-card-head {
  margin-bottom: 0;
}

.access-modal-stack > .access-modal-section:first-child {
  padding-top: 0;
  border-top: 0;
}

.member-editor-row {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.member-editor-list {
  gap: 8px;
}

.access-card-section > .hero-note {
  min-height: 100%;
}

.access-empty-state {
  display: grid;
  place-items: center;
  align-content: center;
  text-align: center;
}

.access-empty-state .hero-note__inner {
  width: min(100%, 360px);
}

:deep(.n-modal .n-card-header) {
  padding: 14px 16px 6px;
}

:deep(.n-modal .n-card__content) {
  padding: 10px 14px 14px;
}

@media (min-width: 1024px) {
  .access-main-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .access-panel-banner,
  .access-card-banner,
  .access-modal-section__header {
    align-items: stretch;
    flex-direction: column;
  }

  .access-panel-banner__meta,
  .access-card-banner__actions {
    width: 100%;
    justify-content: flex-start;
  }

  .permission-section-grid,
  .access-overview-grid,
  .access-entry-card__meta,
  .member-editor-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .access-overview-card + .access-overview-card {
    border-left: 0;
    border-top: 1px solid var(--app-border-soft);
  }

  .access-entry-card__top,
  .access-entry-card__actions {
    flex-direction: column;
  }
}
</style>
