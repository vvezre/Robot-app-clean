import request from '../utils/request'
import { API_ENDPOINTS } from '../config/api'
import { TaskLog, CityTaskStats, MonthlyFailStats, CityTaskRank } from '../types/api'

/**
 * 任务日志服务
 */
export const taskLogService = {
  /**
   * 获取任务日志列表
   */
  getTaskLogList: async (): Promise<TaskLog[]> => {
    return request.get<TaskLog[]>(API_ENDPOINTS.taskLog.list)
  },

  /**
   * 根据ID获取任务日志
   */
  getTaskLogById: async (id: string): Promise<TaskLog> => {
    return request.get<TaskLog>(API_ENDPOINTS.taskLog.getById(id))
  },

  /**
   * 添加任务日志
   */
  addTaskLog: async (taskLog: TaskLog): Promise<TaskLog> => {
    return request.post<TaskLog>(API_ENDPOINTS.taskLog.add, taskLog)
  },

  /**
   * 更新任务日志
   */
  updateTaskLog: async (taskLog: TaskLog): Promise<TaskLog> => {
    return request.put<TaskLog>(API_ENDPOINTS.taskLog.update, taskLog)
  },

  /**
   * 删除任务日志
   */
  deleteTaskLog: async (id: string): Promise<void> => {
    return request.delete<void>(API_ENDPOINTS.taskLog.delete(id))
  },

  /**
   * 获取城市任务统计
   */
  getCityStats: async (): Promise<CityTaskStats[]> => {
    return request.get<CityTaskStats[]>(API_ENDPOINTS.taskLog.cityStats)
  },

  /**
   * 获取月度失败统计
   */
  getMonthlyFailStats: async (): Promise<MonthlyFailStats[]> => {
    return request.get<MonthlyFailStats[]>(API_ENDPOINTS.taskLog.monthlyFailStats)
  },

  /**
   * 获取城市任务排名
   */
  getCityTaskRank: async (): Promise<CityTaskRank[]> => {
    return request.get<CityTaskRank[]>(API_ENDPOINTS.taskLog.cityTaskRank)
  },
}

export default taskLogService
