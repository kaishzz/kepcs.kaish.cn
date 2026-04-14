import { defineStore } from 'pinia'

import { http } from '../lib/api'
import { CONSOLE_API_BASE } from '../lib/console'
import type { SessionUser } from '../types'

interface AuthState {
  user: SessionUser | null
  loading: boolean
  loaded: boolean
}

let fetchMeTask: Promise<void> | null = null

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    loading: false,
    loaded: false,
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.user),
  },
  actions: {
    async fetchMe() {
      if (fetchMeTask) {
        await fetchMeTask
        return
      }

      this.loading = true

      fetchMeTask = (async () => {
        try {
          const { data } = await http.get(`${CONSOLE_API_BASE}/auth/me`)
          this.user = data.user || null
        } catch {
          this.user = null
        } finally {
          this.loading = false
          this.loaded = true
          fetchMeTask = null
        }
      })()

      await fetchMeTask
    },
    async logout() {
      await http.post(`${CONSOLE_API_BASE}/auth/logout`)
      this.user = null
      this.loaded = true
    },
  },
})
