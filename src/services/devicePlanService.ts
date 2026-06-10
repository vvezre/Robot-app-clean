import request from '../utils/request'
import { API_ENDPOINTS } from '../config/api'

export interface DevicePlan {
    id?: number
    userId?: number
    deviceId: string
    isRepeat: number // 1:重复 0:单次
    executeDate?: string // YYYY-MM-DD
    intervalUnit?: 'day' | 'week' | 'month' // 重复单位
    intervalValue?: number // 间隔
    executeDays?: string // 1,3,5 (周几或者几号)
    executeTime: string // HH:mm
    status?: number // 1:启用 0:停用
    createTime?: string
    updateTime?: string
}

export const devicePlanService = {
    /**
     * 获取设备计划列表
     */
    async getPlans(deviceId: string): Promise<DevicePlan[]> {
        try {
            const result = await request.get<DevicePlan[]>(API_ENDPOINTS.devicePlan.list, { deviceId })
            return result || []
        } catch (error) {
            console.error('[DevicePlanService] 获取列表失败:', error)
            return []
        }
    },

    /**
     * 新增计划
     */
    async addPlan(plan: DevicePlan): Promise<DevicePlan> {
        try {
            const result = await request.post<DevicePlan>(API_ENDPOINTS.devicePlan.add, plan)
            return result
        } catch (error) {
            console.error('[DevicePlanService] 添加计划失败:', error)
            throw error
        }
    },

    /**
     * 更新计划
     */
    async updatePlan(id: number, plan: Partial<DevicePlan>): Promise<DevicePlan> {
        try {
            const result = await request.put<DevicePlan>(API_ENDPOINTS.devicePlan.update(id), plan)
            return result
        } catch (error) {
            console.error('[DevicePlanService] 更新计划失败:', error)
            throw error
        }
    },

    /**
     * 删除计划
     */
    async deletePlan(id: number): Promise<boolean> {
        try {
            await request.delete(API_ENDPOINTS.devicePlan.delete(id))
            return true
        } catch (error) {
            console.error('[DevicePlanService] 删除计划失败:', error)
            throw error
        }
    }
}

export default devicePlanService
