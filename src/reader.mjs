export async function collect(client) {
 const document=await client("/capture");
 return [{id:document.device+':'+document.boot+':'+document.localTrigger,...document}];
}
