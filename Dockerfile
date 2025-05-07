FROM denoland/deno

COPY . .

EXPOSE 8000


RUN deno install --entrypoint server_main.ts

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "server_main.ts"]