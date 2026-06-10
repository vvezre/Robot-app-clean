import request from '../utils/request'
import { API_ENDPOINTS } from '../config/api'
import { CleanRoute } from '../types/api'

/**
 * 清洁路线服务
 */
export const cleanRouteService = {
  /**
   * 获取清洁路线列表
   */
  getCleanRouteList: async (): Promise<CleanRoute[]> => {
    return request.get<CleanRoute[]>(API_ENDPOINTS.cleanRoute.list)
  },

  /**
   * 根据ID获取清洁路线
   */
  getCleanRouteById: async (id: number): Promise<CleanRoute> => {
    return request.get<CleanRoute>(API_ENDPOINTS.cleanRoute.getById(id))
  },

  /**
   * 添加清洁路线
   */
  addCleanRoute: async (route: CleanRoute): Promise<CleanRoute> => {
    return request.post<CleanRoute>(API_ENDPOINTS.cleanRoute.add, route)
  },

  /**
   * 更新清洁路线
   */
  updateCleanRoute: async (route: CleanRoute): Promise<CleanRoute> => {
    return request.put<CleanRoute>(API_ENDPOINTS.cleanRoute.update, route)
  },

  /**
   * 删除清洁路线
   */
  deleteCleanRoute: async (id: number): Promise<void> => {
    return request.delete<void>(API_ENDPOINTS.cleanRoute.delete(id))
  },
}

export default cleanRouteService
