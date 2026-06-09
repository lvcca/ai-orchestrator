import { redisGet } from "../state/state.ts"

export const execute = () => {
    const getAllEntries = redisGet('*')
}