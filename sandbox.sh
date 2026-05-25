#!/bin/bash 

source .env

account=$(gcloud auth list  --filter=status:ACTIVE --format="value(account)")

if [ "$account" == $GOOGLE_LDAP ]; then
    echo "Logged in. "
    echo "$account"
else
    echo "Not logged in"
    gcloud auth login
fi

if [ "$1" == "tunnel" ]; then
    response=$(gcloud compute start-iap-tunnel \
        $SANDBOX_INSTANCE 3389 \
        --project=$SANDBOX_PROJECT \
        --zone=$SANDBOX_ZONE \
        --local-host-port=localhost:$SANDBOX_LOCAL_PORT_NUMBER)
    echo "Tunnel started on port $SANDBOX_LOCAL_PORT_NUMBER"
    echo $response
fi

if [ "$1" == "env" ]; then
    response=$(gcloud compute scp .env $SANDBOX_USER@$SANDBOX_INSTANCE:/home/$SANDBOX_USER/gdc-sandbox/.env \
        --tunnel-through-iap \
        --project $SANDBOX_PROJECT \
        --zone $SANDBOX_ZONE)
    exit 0
fi

if [ "$1" == "config" ]; then
    response=$(gcloud compute scp projects_config.yaml $SANDBOX_USER@$SANDBOX_INSTANCE:/home/$SANDBOX_USER/gdc-sandbox/projects_config.yaml \
        --tunnel-through-iap \
        --project $SANDBOX_PROJECT \
        --zone $SANDBOX_ZONE)
    exit 0
fi

if [ "$1" == "cp" ]; then
    response=$(gcloud compute scp $SANDBOX_INSTANCE:/home/$SANDBOX_USER/$2 $3 \
        --tunnel-through-iap \
        --project $SANDBOX_PROJECT \
        --zone $SANDBOX_ZONE)
    ls -la $3
    exit 0
fi

if [ "$1" == "ssh" ]; then
    response=$(sshuttle -r zone1-org-1-data@$SANDBOX_INSTANCE --no-latency-control \
        --ssh-cmd "gcloud compute ssh --project=$SANDBOX_PROJECT --zone=$SANDBOX_ZONE --tunnel-through-iap" \
        10.200.0.0/16 --dns)
fi

if [ "$1" == "fortress" ]; then
    response=$(gcloud compute scp --recurse workloads/fortress $SANDBOX_USER@$SANDBOX_INSTANCE:/home/$SANDBOX_USER/gdc-sandbox/workloads/ \
        --tunnel-through-iap \
        --project $SANDBOX_PROJECT \
        --zone $SANDBOX_ZONE)
    exit 0
fi