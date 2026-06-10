import request from '../utils/request'
import { API_ENDPOINTS } from '../config/api'
import { User } from '../types/api'

/**
 * 用户服务
 */
export const userService = {
  /**
   * 获取用户列表
   */
  getUserList: async (): Promise<User[]> => {
    return request.get<User[]>(API_ENDPOINTS.user.list)
  },

  /**
   * 根据ID获取用户
   */
  getUserById: async (id: number): Promise<User> => {
    return request.get<User>(API_ENDPOINTS.user.getById(id))
  },

  /**
   * 添加用户
   */
  addUser: async (user: User): Promise<User> => {
    return request.post<User>(API_ENDPOINTS.user.add, user)
  },

  /**
   * 更新用户
   */
  updateUser: async (user: User): Promise<User> => {
    return request.put<User>(API_ENDPOINTS.user.update, user)
  },

  /**
   * 删除用户
   */
  deleteUser: async (id: number): Promise<void> => {
    return request.delete<void>(API_ENDPOINTS.user.delete(id))
  },
}

export default userService
