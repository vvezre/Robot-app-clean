import request from '../utils/request'
import { API_ENDPOINTS } from '../config/api'
import { ChargingStation } from '../types/api'

/**
 * 充电站服务
 */
export const chargingStationService = {
  /**
   * 获取充电站列表
   */
  getChargingStationList: async (): Promise<ChargingStation[]> => {
    return request.get<ChargingStation[]>(API_ENDPOINTS.chargingStation.list)
  },

  /**
   * 根据ID获取充电站
   */
  getChargingStationById: async (id: number): Promise<ChargingStation> => {
    return request.get<ChargingStation>(API_ENDPOINTS.chargingStation.getById(id))
  },

  /**
   * 添加充电站
   */
  addChargingStation: async (station: ChargingStation): Promise<ChargingStation> => {
    return request.post<ChargingStation>(API_ENDPOINTS.chargingStation.add, station)
  },

  /**
   * 更新充电站
   */
  updateChargingStation: async (station: ChargingStation): Promise<ChargingStation> => {
    return request.put<ChargingStation>(API_ENDPOINTS.chargingStation.update, station)
  },

  /**
   * 删除充电站
   */
  deleteChargingStation: async (id: number): Promise<void> => {
    return request.delete<void>(API_ENDPOINTS.chargingStation.delete(id))
  },
}

export default chargingStationService
