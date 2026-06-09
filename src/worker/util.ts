import { Status } from "../state/types.ts";
import { getTask, setTask } from "../state/util.ts";

export const updatePrompt = async (task_id: string, status: Status, task?: string, plan?: string,) => {
    const currentTask = await getTask(task_id);

    const currentReq = currentTask?.prompt?.req ?? []
    const currentRes = currentTask?.prompt?.res ?? []

    if (task) currentReq.push(task)
    if (plan) currentRes.push(plan)

    await setTask ({
        id: task_id, 
        status: status, 
        prompt: {
            req: currentReq, 
            res: currentRes
        }, 
        type: currentTask?.type
    }
    )
}

