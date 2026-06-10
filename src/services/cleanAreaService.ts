import request from '../utils/request'
import { API_ENDPOINTS } from '../config/api'
import { CleanArea } from '../types/api'

/**
 * 清洁区域服务
 */
export const cleanAreaService = {
  /**
   * 获取清洁区域列表
   */
  getCleanAreaList: async (): Promise<CleanArea[]> => {
    return request.get<CleanArea[]>(API_ENDPOINTS.cleanArea.list)
  },

  /**
   * 根据ID获取清洁区域
   */
  getCleanAreaById: async (id: number): Promise<CleanArea> => {
    return request.get<CleanArea>(API_ENDPOINTS.cleanArea.getById(id))
  },

  /**
   * 添加清洁区域
   */
  addCleanArea: async (area: CleanArea): Promise<CleanArea> => {
    return request.post<CleanArea>(API_ENDPOINTS.cleanArea.add, area)
  },

  /**
   * 更新清洁区域
   */
  updateCleanArea: async (area: CleanArea): Promise<CleanArea> => {
    return request.put<CleanArea>(API_ENDPOINTS.cleanArea.update, area)
  },

  /**
   * 删除清洁区域
   */
  deleteCleanArea: async (id: number): Promise<void> => {
    return request.delete<void>(API_ENDPOINTS.cleanArea.delete(id))
  },
}

export default cleanAreaService
