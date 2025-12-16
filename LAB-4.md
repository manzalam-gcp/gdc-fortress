## Lab 4 - Deploy Virtual Machine


1. Run Login.

2. Run the following command to list available VM images.

```bash
gdcloud compute images list

```

3. Run the following command to list available machine types.

```bash
gdcloud compute machine-types list

```

4. Run ./create-vm.sh [VM_Name] [Machine_Type] [Image_Type]

example: ./create-vm.sh test-vm n3-standard-2-gdc rocky-8-v20250210-gdch

#Pick the image and the machine types from the available list.

```bash
./create-vm.sh test-vm n3-standard-2-gdc rocky-8-v20250210-gdch

```


5. SSH into vm from GDC Console