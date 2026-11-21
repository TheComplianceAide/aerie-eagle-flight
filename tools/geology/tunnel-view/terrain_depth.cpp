#include <algorithm>
#include <cmath>
#include <vector>
struct V {float x,y,z;};
extern "C" void raster(const float* dem,int cols,int rows,float xmin,float zmin,float step,
    const double* q,int w,int h,float* depth,float* world){
  // Rows are north to south, heights in the game vertical datum. Project
  // every surveyed node, then perspective-correct each terrain triangle.
  const double x0=q[0],y0=q[1],z0=q[2],fl=q[6]*w/900.,dist=q[7];
  const double a=q[3]*M_PI/180.,b=q[4]*M_PI/180.,r=q[5]*M_PI/180.;
  const double fx=sin(a)*cos(b),fy=sin(b),fz=-cos(a)*cos(b);
  const double xx=cos(a),xz=sin(a),ux=-sin(b)*sin(a),uy=cos(b),uz=sin(b)*cos(a);
  const double hx=xx*cos(r)+ux*sin(r),hy=uy*sin(r),hz=xz*cos(r)+uz*sin(r);
  const double vx=ux*cos(r)-xx*sin(r),vy=uy*cos(r),vz=uz*cos(r)-xz*sin(r);
  std::vector<V> projection(rows*cols);
  for(int j=0;j<rows;j++)for(int i=0;i<cols;i++){
    const int k=j*cols+i;const double dx=xmin+i*step-x0,dy=dem[k]-y0,dz=zmin+j*step-z0;
    const double z=dx*fx+dy*fy+dz*fz,rx=(dx*hx+dy*hy+dz*hz)/z,ry=(dx*vx+dy*vy+dz*vz)/z;
    const double fac=1.+dist*(rx*rx+ry*ry);
    projection[k]={(float)(w*.5+fl*rx*fac),(float)(h*.5-fl*ry*fac),(float)z};
  }
  auto tri=[&](int ia,int ib,int ic){
    V p=projection[ia],v=projection[ib],u=projection[ic];if(std::min({p.z,v.z,u.z})<1.1)return;
    int l=std::max(0,(int)floor(std::min({p.x,v.x,u.x}))),r=std::min(w-1,(int)ceil(std::max({p.x,v.x,u.x})));
    int t=std::max(0,(int)floor(std::min({p.y,v.y,u.y}))),b=std::min(h-1,(int)ceil(std::max({p.y,v.y,u.y})));
    if(r<l||b<t)return;
    double det=(v.y-u.y)*(p.x-u.x)+(u.x-v.x)*(p.y-u.y);
    if(std::abs(det)<1.e-6)return;
    for(int y=t;y<=b;y++)for(int x=l;x<=r;x++){
      double a=((v.y-u.y)*(x+.5-u.x)+(u.x-v.x)*(y+.5-u.y))/det;
      double bb=((u.y-p.y)*(x+.5-u.x)+(p.x-u.x)*(y+.5-u.y))/det;
      double c=1-a-bb;if(std::min({a,bb,c})<-.0003)continue;
      double z=1/(a/p.z+bb/v.z+c/u.z);int idx=y*w+x;if(z>=depth[idx])continue;
      depth[idx]=z;a*=z/p.z;bb*=z/v.z;c*=z/u.z;
      world[3*idx+0]=xmin+step*(a*(ia%cols)+bb*(ib%cols)+c*(ic%cols));
      world[3*idx+1]=a*dem[ia]+bb*dem[ib]+c*dem[ic];
      world[3*idx+2]=zmin+step*(a*(ia/cols)+bb*(ib/cols)+c*(ic/cols));
    }
  };
  for(int j=0;j<rows-1;j++)for(int i=0;i<cols-1;i++){int a=j*cols+i,b=a+cols;tri(a,b,a+1);tri(a+1,b,b+1);}
}
