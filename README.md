## Wabot 

An autonomous LLM based whatsapp client that can fulfill several use cases :-
1. Build interactive bots that can be invoked with a custom phrase e.g. "@mbot, "@xbot", "@nsebot", "@newsbot" per case from whatsapp chats.
2. Integrate your custom LLM instead of using Meta AI LLM in whastapp. 
3. A promotion client that can promote brand products through statuses given a list of image & resources [TO DO] 

### Quickstart 
1. Login to huggingface -> Get an hf-token 
2. Create an environmental variables file named ".env" and create variable HF_TOKEN=<YOUR_HF_TOKEN>
3. From within directory mcp_server call
    npm start
4. From within directory mcp_client call
    npm start
5. Enjoy your personal whatsapp bot "@mbot" from within whatsapp chats e.g. From within any    group or personal chat send message "@mbot why is the sky blue"

### Project dependencies  -
1. FastMCP typescript
2. Whatsapp Baileys 
3. Huggingface inference provider
