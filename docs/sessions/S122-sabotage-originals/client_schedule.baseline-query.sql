select md5(pg_get_functiondef(p.oid)) as def_md5,
       coalesce(p.proacl::text, '(default)') as acl,
       md5(coalesce(obj_description(p.oid, 'pg_proc'), '')) as comment_md5,
       pg_get_function_result(p.oid) as result,
       p.prosecdef as secdef, p.provolatile as vol,
       pg_get_functiondef(p.oid) as def,
       obj_description(p.oid, 'pg_proc') as comment
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'client_schedule';
