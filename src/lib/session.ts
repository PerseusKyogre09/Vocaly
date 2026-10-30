import { getAuth } from './auth';

export async function getSession(request: Request) {
  try {
    return await getAuth().api.getSession({ headers: request.headers });
  } catch {
    return null;
  }
}
