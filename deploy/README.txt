ChatMap：云服务器部署（无 Docker、无域名、仅公网 IP）
====================================================

思路：Nginx 监听 80，静态托管前端 dist；/api 反代到本机 Spring Boot（仅 127.0.0.1:8080，不对外开 8080）。

一、服务器准备（以 Ubuntu 为例）
--------------------------------
  sudo apt update
  sudo apt install -y openjdk-8-jre-headless nginx

二、后端
------
  LLM 地址与模型已写在 application.yml（DeepSeek）；密钥必须启动时传入，勿写进仓库。

  方式 A — 命令行参数（推荐手写启动时）：
    java -Dspring.profiles.active=prod -jar /opt/chatmap/chat-map-backend.jar \
      --app.llm.api-key=你的DeepSeek密钥

  方式 B — JVM 系统属性：
    java -Dspring.profiles.active=prod -Dapp.llm.api-key=你的DeepSeek密钥 -jar /opt/chatmap/chat-map-backend.jar

  方式 C — systemd + 环境变量（Spring 会读 APP_LLM_API_KEY 绑定到 app.llm.api-key）：
    1) sudo cp deploy/chatmap.env.example /etc/chatmap.env
       编辑填入：APP_LLM_API_KEY=你的密钥（不要用 LLM_API_KEY 这个名字）
       sudo chmod 600 /etc/chatmap.env
    2) 复制 deploy/chat-map-backend.service 到 /etc/systemd/system/
    3) sudo useradd -r -s /usr/sbin/nologin chatmap 2>/dev/null || true
       sudo chown -R chatmap:chatmap /opt/chatmap
    4) sudo systemctl daemon-reload && sudo systemctl enable --now chat-map-backend

  打包与上传：
    本机：cd chat-map-backend && mvn -DskipTests package
    将 target/chat-map-backend-0.0.1-SNAPSHOT.jar 放到 /opt/chatmap/chat-map-backend.jar

三、前端
------
  1) 本机：cd chat-map-frontend && npm ci && npm run build
  2) 将 dist 目录上传到服务器，例如：
       sudo mkdir -p /var/www/chatmap
       sudo rsync -av dist/ /var/www/chatmap/dist/
  3) 编辑 deploy/nginx-chatmap.conf，确认 root 与 dist 路径一致（默认 /var/www/chatmap/dist）
  4) 安装站点（若与默认站点冲突，可先禁用：sudo rm /etc/nginx/sites-enabled/default）：
       sudo cp nginx-chatmap.conf /etc/nginx/conf.d/chatmap.conf
       sudo nginx -t && sudo systemctl reload nginx

四、防火墙 / 安全组
-------------------
  只放行 TCP 80（及 SSH）。不要对公网开放 8080。

五、访问
--------
  浏览器打开：http://你的公网IP/

  前端请求为相对路径 /api/...，与页面同 IP、同端口，无需改 Vite 或单独配 CORS。

六、本地开发
------------
  不设 spring.profiles.active=prod 时，后端监听 0.0.0.0:8080，与 npm run dev + Vite 代理一致。
  生产 profile 见 application-prod.yml：监听 0.0.0.0:8080（Docker 内 Nginx 经 172.17.0.1 反代）。
  本地若要调真实模型：java -jar ... --app.llm.api-key=密钥

七、访问仍是「Welcome to nginx!」
--------------------------------
  原因：系统自带的 default 站点仍是 80 端口的 default_server，或 Docker 里仍是默认页。
  处理（本机 apt 安装的 nginx）：
    1) 禁用默认站点：sudo rm /etc/nginx/sites-enabled/default
    2) 确认 chatmap 配置已加载：ls /etc/nginx/conf.d/chatmap.conf
    3) 确认前端已上传到配置里的 root，且存在 index.html：
         sudo ls -la /var/www/chatmap/dist/index.html
    4) 测试并重载：sudo nginx -t && sudo systemctl reload nginx
  若用 Docker 跑 nginx：80 端口可能映射到容器内默认页；需在挂载的 conf.d 里放本配置，
  或停掉宿主机 nginx，避免两个进程抢 80。

八、Nginx 用 Docker、挂载与下面一致时
-------------------------------------
  宿主机 conf.d -> /etc/nginx/conf.d
  宿主机 html   -> /usr/share/nginx/html
  （你当前：/data/dockerData/nginx/conf.d 与 /data/dockerData/nginx/html）

  1) 不要用 nginx-chatmap.conf 里的 root /var/www/chatmap/dist，静态站应放在挂载的 html：
       把 dist 内文件上传到  /data/dockerData/nginx/html/
  2) 使用 deploy/nginx-chatmap.docker.conf，复制为：
       /data/dockerData/nginx/conf.d/chatmap.conf
  3) 删除或改名 conf.d 里的 default.conf（否则仍是 Welcome to nginx!）
  4) 确认主配置 /data/dockerData/nginx/conf/nginx.conf 内有：
       include /etc/nginx/conf.d/*.conf;
  5) 后端若跑在「宿主机」上：proxy_pass 用 172.17.0.1:8080；且 Spring 不能用仅 127.0.0.1
       监听（否则容器连不上），见 application-prod.yml 中 server.address: 0.0.0.0。
       公网安全组勿放行 8080。验证：docker exec <nginx> wget -qO- --timeout=3 http://172.17.0.1:8080/（能连上即可，404 也正常）。
  6) 重载：docker exec <nginx容器名> nginx -t && docker exec <nginx容器名> nginx -s reload
