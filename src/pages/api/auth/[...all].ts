import type { APIRoute } from 'astro';
import { authError, getAuth } from '../../../lib/auth';

export const prerender = false;

const handle: APIRoute = async ({ request }) => {
  try {
    return await getAuth().handler(request);
  } catch (error) {
    return authError(error);
  }
};

export const GET = handle;
export const POST = handle;
